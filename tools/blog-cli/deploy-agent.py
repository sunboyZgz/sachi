"""Small stdlib-only deployment helper, invoked over SSH stdin or locally.

No service configuration, package installation, source deletion or asset GC.
The public document root must be <root>/current, never <root> itself.
"""
import base64
import contextlib
import datetime
import fcntl
import hashlib
import json
import os
import pathlib
import re
import shutil
import sys
import tarfile
import tempfile
import time
import urllib.request


class Failure(Exception):
    def __init__(self, message, code=7, status="ERROR"):
        super().__init__(message)
        self.code = code
        self.status = status


root = pathlib.Path(sys.argv[1])
action = sys.argv[2]
payload = json.loads(base64.b64decode(sys.argv[3]))
if not root.is_absolute() or str(root) in ("/", str(pathlib.Path.home())) or len(root.parts) < 3:
    raise RuntimeError("Unsafe deploy root")
if root.is_symlink():
    raise RuntimeError("Deploy root must not be a symlink")
root = root.resolve()
if str(root) in ("/", str(pathlib.Path.home().resolve())) or len(root.parts) < 3:
    raise RuntimeError("Unsafe canonical deploy root")
for parent in [root, *root.parents]:
    if parent.is_symlink():
        raise RuntimeError("Deploy root must not contain symlinks")


def release_id(value):
    if not isinstance(value, str) or not re.fullmatch(r"r-[a-zA-Z0-9-]{8,80}", value):
        raise Failure("Invalid release ID", 2)
    return value


def digest(file):
    result = hashlib.sha256()
    with open(file, "rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def write_json(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    handle, name = tempfile.mkstemp(prefix=".record-", dir=file.parent)
    try:
        with os.fdopen(handle, "w") as output:
            json.dump(value, output, ensure_ascii=False, indent=2)
            output.flush()
            os.fsync(output.fileno())
        os.replace(name, file)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def manifest(identifier):
    directory = root / "releases" / release_id(identifier)
    with open(directory / "release.json") as handle:
        value = json.load(handle)
    if value.get("schemaVersion") != 1 or value.get("releaseId") != identifier:
        raise Failure("Invalid release manifest", 3)
    return value


def current():
    link = root / "current"
    if not os.path.lexists(link):
        return None
    if not link.is_symlink():
        raise Failure("Existing current is not a managed symlink; refusing takeover", 2)
    target = os.readlink(link)
    match = re.fullmatch(r"releases/(r-[a-zA-Z0-9-]{8,80})/site", target)
    if not match:
        raise Failure("Existing current is not managed; refusing takeover", 2)
    return manifest(match[1])


def prepare():
    marker = root / ".sachi-blog-root"
    if root.exists() and not marker.exists() and any(root.iterdir()):
        raise Failure("Deploy directory is not empty and is not managed. Choose a new dedicated directory.", 2)
    root.mkdir(parents=True, exist_ok=True)
    if not marker.exists():
        with open(marker, "x") as handle:
            handle.write("sachi-blog-v1\n")
    for name in ("staging", "releases", "shared", "records"):
        directory = root / name
        if directory.is_symlink():
            raise Failure("Managed directory must not be a symlink", 2)
        directory.mkdir(exist_ok=True)


@contextlib.contextmanager
def locked():
    prepare()
    with open(root / ".deploy.lock", "a") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Failure("Another deployment holds the server lock", 4)
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def verify(directory):
    checks = json.loads((directory / "checksums.json").read_text())
    actual = set()
    for file in directory.rglob("*"):
        if file.is_symlink() or (not file.is_file() and not file.is_dir()):
            raise Failure("Package contains a symlink or special file", 3)
        if file.is_file() and file.relative_to(directory).as_posix() != "checksums.json":
            relative = file.relative_to(directory).as_posix()
            actual.add(relative)
            if checks.get(relative) != digest(file):
                raise Failure("Checksum mismatch: " + relative, 3)
    if actual != set(checks):
        raise Failure("Package file list does not match checksums", 3)


def receive():
    identifier = release_id(payload["releaseId"])
    archive = root / "staging" / (identifier + ".tar")
    destination = root / "releases" / identifier
    if destination.exists():
        verify(destination)
        if digest(destination / "checksums.json") != payload["checksumsHash"]:
            raise Failure("Immutable release ID conflicts with existing package", 4)
        return {"status": "PREPARED", "releaseId": identifier}
    if digest(archive) != payload["archiveHash"]:
        raise Failure("Uploaded archive checksum mismatch", 3)
    temporary = pathlib.Path(tempfile.mkdtemp(prefix=identifier + "-", dir=root / "staging"))
    try:
        with tarfile.open(archive, "r:") as bundle:
            total = 0
            members = bundle.getmembers()
            if len(members) > 100000:
                raise Failure("Too many archive entries", 3)
            names = set()
            for item in members:
                name = pathlib.PurePosixPath(item.name)
                if name.is_absolute() or ".." in name.parts or not (item.isfile() or item.isdir()):
                    raise Failure("Unsafe archive entry: " + item.name, 3)
                normalized = str(name)
                if normalized in names:
                    raise Failure("Duplicate archive entry", 3)
                names.add(normalized)
                total += item.size
                if total > 20 * 1024 ** 3:
                    raise Failure("Archive exceeds size limit", 3)
                output = temporary.joinpath(*name.parts)
                if item.isdir():
                    output.mkdir(parents=True, exist_ok=True)
                else:
                    output.parent.mkdir(parents=True, exist_ok=True)
                    with bundle.extractfile(item) as source, open(output, "xb") as target:
                        shutil.copyfileobj(source, target)
        verify(temporary)
        if digest(temporary / "checksums.json") != payload["checksumsHash"]:
            raise Failure("Checksums descriptor does not match upload plan", 3)
        descriptor = json.loads((temporary / "release.json").read_text())
        if descriptor.get("releaseId") != identifier:
            raise Failure("Archive release ID mismatch", 3)
        with locked():
            if destination.exists():
                if digest(destination / "checksums.json") != payload["checksumsHash"]:
                    raise Failure("Concurrent immutable release conflict", 4)
            else:
                os.rename(temporary, destination)
        return {"status": "PREPARED", "releaseId": identifier}
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)


def retain_assets(site):
    for folder in ("media", "versions"):
        source = site / folder
        if not source.exists():
            continue
        for file in source.rglob("*"):
            if file.is_symlink():
                raise Failure("Immutable assets cannot be symlinks", 3)
            if not file.is_file():
                continue
            target = root / "shared" / folder / file.relative_to(source)
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                if digest(target) != digest(file):
                    raise Failure("Immutable shared asset conflict", 4)
            else:
                temporary = target.with_name(target.name + ".upload")
                shutil.copyfile(file, temporary)
                os.replace(temporary, target)


def switch(identifier):
    temporary = root / ".current-next"
    if os.path.lexists(temporary):
        os.unlink(temporary)
    os.symlink("releases/" + identifier + "/site", temporary)
    os.replace(temporary, root / "current")


def health(identifier):
    site = root / "releases" / identifier / "site"
    descriptor = manifest(identifier)
    for relative in ["index.html", "contents/index.html", *["article/" + e["slug"] + "/index.html" for e in descriptor["entries"]]]:
        if not (site / relative).is_file():
            raise Failure("Published page missing: " + relative)
    if json.loads((site / "release-marker.json").read_text()).get("releaseId") != identifier:
        raise Failure("Release marker mismatch")
    url = payload.get("siteUrl")
    if url:
        last_error = None
        for attempt in range(3):
            try:
                request = urllib.request.Request(url.rstrip("/") + "/release-marker.json?release=" + identifier, headers={"Cache-Control": "no-cache"})
                with urllib.request.urlopen(request, timeout=8) as response:
                    if json.load(response).get("releaseId") != identifier:
                        raise Failure("Public release marker does not match")
                return
            except Exception as error:
                last_error = error
                if attempt < 2:
                    time.sleep(1)
        raise Failure("Public health check failed: " + str(last_error))


def activate(rollback=False):
    identifier = release_id(payload["releaseId"])
    with locked():
        previous = current()
        previous_id = previous["releaseId"] if previous else None
        if previous_id == identifier:
            return {"status": "DEPLOYED", "releaseId": identifier, "alreadyCurrent": True, "manifest": previous}
        if previous_id != payload.get("baseReleaseId"):
            raise Failure("Current release changed since planning; re-plan required", 4)
        descriptor = manifest(identifier)
        target = root / "releases" / identifier
        verify(target)
        retain_assets(target / "site")
        switch(identifier)
        status = "DEPLOYED"
        reason = None
        try:
            health(identifier)
        except Exception as error:
            reason = str(error)
            if previous_id:
                switch(previous_id)
            elif os.path.lexists(root / "current"):
                os.unlink(root / "current")
            status = "FAILED_ROLLED_BACK"
        record = {"status": status, "releaseId": identifier, "previousReleaseId": previous_id, "activatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "operation": "rollback" if rollback else "publish", "reason": reason}
        record_id = payload.get("operationId", identifier)
        release_id(record_id)
        write_json(root / "records" / (record_id + ".json"), record)
        if status != "DEPLOYED":
            raise Failure(reason, 7, status)
        return {**record, "manifest": descriptor}


def dispatch():
    if action == "current":
        return {"status": "VERIFIED", "managed": (root / ".sachi-blog-root").exists(), "manifest": current()}
    if action == "history":
        records = [json.loads(file.read_text()) for file in sorted((root / "records").glob("*.json"))] if root.exists() else []
        return {"status": "VERIFIED", "records": records}
    if action == "manifest":
        return {"status": "VERIFIED", "manifest": manifest(payload["releaseId"])}
    if action == "prepare":
        prepare()
        return {"status": "READY"}
    if action == "receive":
        return receive()
    if action in ("activate", "rollback"):
        return activate(action == "rollback")
    if action == "export":
        identifier = release_id(payload["releaseId"])
        directory = root / "releases" / identifier
        verify(directory)
        archive = root / "staging" / (identifier + "-restore.tar")
        with tarfile.open(archive, "w") as bundle:
            bundle.add(directory, arcname=".", recursive=True)
        return {"status": "READY", "path": str(archive), "hash": digest(archive)}
    raise Failure("Unknown deploy action", 2)


try:
    print(json.dumps(dispatch(), ensure_ascii=False))
except Failure as error:
    print(json.dumps({"status": error.status, "error": str(error), "code": error.code}, ensure_ascii=False))
except Exception as error:
    print(json.dumps({"status": "ERROR", "error": str(error), "code": 7}, ensure_ascii=False))
