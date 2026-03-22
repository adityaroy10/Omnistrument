import urllib.request
import tarfile
import os
import sys

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'data'))
os.makedirs(DATA_DIR, exist_ok=True)

# Using the Test split of NSynth (~400MB) instead of Train (30GB) for quick evaluation
URL = "http://download.magenta.tensorflow.org/datasets/nsynth/nsynth-test.jsonwav.tar.gz"
FILENAME = os.path.join(DATA_DIR, "nsynth-test.jsonwav.tar.gz")

def reporthook(blocknum, blocksize, totalsize):
    readsofar = blocknum * blocksize
    if totalsize > 0:
        percent = readsofar * 100 / totalsize
        s = "\r%5.1f%% %*d / %d" % (percent, len(str(totalsize)), readsofar, totalsize)
        sys.stderr.write(s)
        if readsofar >= totalsize:
            sys.stderr.write("\n")
    else:
        sys.stderr.write("read %d\n" % (readsofar,))

try:
    print(f"Downloading NSynth Test Split to {FILENAME}...")
    urllib.request.urlretrieve(URL, FILENAME, reporthook)
    
    print("Extracting dataset... this might take a minute.")
    with tarfile.open(FILENAME, "r:gz") as tar:
        tar.extractall(path=DATA_DIR)
        
    print("Download and extraction complete. Removing tarball...")
    os.remove(FILENAME)
    print("Done! Data is located in:", os.path.join(DATA_DIR, "nsynth-test"))
except Exception as e:
    print(f"Error during download or extraction: {e}")
