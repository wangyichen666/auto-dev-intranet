from fastapi import Request

from .gateway import AgentAutoDevGateway


def gateway(request: Request) -> AgentAutoDevGateway:
    return request.app.state.gateway
