"""Prepare the checked Kazakh Vosk model as an asset for the browser."""

import argparse
import hashlib
import shutil
import tarfile
import zipfile
from pathlib import Path, PurePosixPath
from tempfile import TemporaryDirectory
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parent
NAME = "vosk-model-small-kz-0.42"
URL = f"https://alphacephei.com/vosk/models/{NAME}.zip"
SHA256 = "b6d6bfe6195c866805bd18b1f56723e4d2ba4866e81df1481006d0c5704fda4f"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zip", type=Path, help="Use an existing copy of the official ZIP file.")
    args = parser.parse_args()
    cache = ROOT / ".til-data"
    cache.mkdir(exist_ok=True)
    model = cache / f"{NAME}.tar.gz"
    with TemporaryDirectory(dir=cache) as directory:
        work = Path(directory)
        archive = args.zip or work / f"{NAME}.zip"
        if not args.zip:
            with urlopen(URL, timeout=120) as response, archive.open("wb") as output:
                shutil.copyfileobj(response, output)
        with archive.open("rb") as source:
            if hashlib.file_digest(source, "sha256").hexdigest() != SHA256:
                raise ValueError("Kazakh speech model checksum mismatch")
        prepared = work / model.name
        with zipfile.ZipFile(archive) as source, tarfile.open(prepared, "w:gz", compresslevel=4) as target:
            for item in source.infolist():
                path = PurePosixPath(item.filename)
                if path.parts[0] != NAME or ".." in path.parts:
                    raise ValueError(f"Unexpected model member: {path}")
                info = tarfile.TarInfo(path.as_posix())
                if item.is_dir():
                    info.type = tarfile.DIRTYPE
                    info.mode = 0o755
                    target.addfile(info)
                    continue
                info.size = item.file_size
                with source.open(item) as data:
                    target.addfile(info, data)
            target.add(ROOT / "VOSK-LICENSE.txt", arcname=f"{NAME}/LICENSE")
        prepared.replace(model)
    print(f"Prepared {model.name} ({model.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
