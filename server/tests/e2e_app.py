import os

from auto_dev_intranet.app import create_app
from tests.fake_gateway import FakeGateway

app = create_app(
    FakeGateway(seed=os.getenv("E2E_SEED") == "1", advance=True), token="e2e-test-token"
)
