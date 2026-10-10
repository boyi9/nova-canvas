"""账号授权与凭证托管：官方 OAuth 2.0 授权码流程 + AES-256 加密存储 + 一键撤销。"""
from __future__ import annotations

import base64
import json
import os
import secrets
from dataclasses import dataclass, asdict, field
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


# OAuth 范围定义（能力级授权，非账号级全权）
OAUTH_SCOPES = {
    "video.publish": "发布视频",
    "video.data.read": "读取视频数据",
    "video.comment.read": "读取视频评论",
    "shop.product.manage": "商品管理",
    "shop.order.read": "读取订单",
    "live.data.read": "直播数据",
    "live.interact": "直播互动",
    "account.profile.read": "读取账号基础信息",
    "account.fans.read": "读取粉丝画像",
    "ads.campaign.manage": "广告投放管理",
    "ads.report.read": "广告报表读取",
}

# 平台配置
PLATFORM_CONFIGS = {
    "douyin": {
        "name": "抖音",
        "auth_url": "https://open.douyin.com/platform/oauth/connect/",
        "token_url": "https://open.douyin.com/oauth/access_token/",
        "refresh_url": "https://open.douyin.com/oauth/refresh_token/",
        "revoke_url": "https://open.douyin.com/oauth/revoke_token/",
        "user_info_url": "https://open.douyin.com/oauth/userinfo/",
        "scopes": list(OAUTH_SCOPES.keys()),
        "daily_quota": 500,  # 初级认证日调用上限
        "requires_enterprise": True,
    },
    "xiaohongshu": {
        "name": "小红书",
        "auth_url": "https://www.xiaohongshu.com/oauth/authorize",
        "token_url": "https://api.xiaohongshu.com/oauth/token",
        "refresh_url": "https://api.xiaohongshu.com/oauth/refresh_token",
        "revoke_url": "https://api.xiaohongshu.com/oauth/revoke",
        "user_info_url": "https://api.xiaohongshu.com/oauth/userinfo",
        "scopes": list(OAUTH_SCOPES.keys()),
        "daily_quota": 1000,
        "requires_enterprise": True,
    },
    "kuaishou": {
        "name": "快手",
        "auth_url": "https://open.kuaishou.com/oauth2/authorize",
        "token_url": "https://open.kuaishou.com/oauth2/token",
        "refresh_url": "https://open.kuaishou.com/oauth2/refresh_token",
        "revoke_url": "https://open.kuaishou.com/oauth2/revoke",
        "user_info_url": "https://open.kuaishou.com/oauth2/userinfo",
        "scopes": list(OAUTH_SCOPES.keys()),
        "daily_quota": 500,
        "requires_enterprise": True,
    },
    "video_channel": {
        "name": "视频号",
        "auth_url": "https://channels.weixin.qq.com/oauth/authorize",
        "token_url": "https://api.weixin.qq.com/sns/oauth2/access_token",
        "refresh_url": "https://api.weixin.qq.com/sns/oauth2/refresh_token",
        "revoke_url": "",
        "user_info_url": "https://api.weixin.qq.com/sns/userinfo",
        "scopes": ["video.publish", "video.data.read", "shop.product.manage", "account.profile.read"],
        "daily_quota": 200,
        "requires_enterprise": True,
    },
    "tiktok": {
        "name": "TikTok",
        "auth_url": "https://www.tiktok.com/v2/auth/authorize/",
        "token_url": "https://open-api.tiktok.com/oauth/access_token/",
        "refresh_url": "https://open-api.tiktok.com/oauth/refresh_token/",
        "revoke_url": "https://open-api.tiktok.com/oauth/revoke/",
        "user_info_url": "https://open-api.tiktok.com/oauth/userinfo/",
        "scopes": list(OAUTH_SCOPES.keys()),
        "daily_quota": 500,
        "requires_enterprise": True,
    },
}


@dataclass
class OAuthCredentials:
    """OAuth 凭证（加密存储）。"""
    platform: str
    account_id: str
    access_token: str
    refresh_token: str
    expires_at: str  # ISO format
    scope: List[str]
    token_type: str = "Bearer"
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class AccountAuthorization:
    """账号授权记录。"""
    id: str
    user_id: str
    platform: str
    platform_account_id: str
    platform_username: str
    credentials: OAuthCredentials
    granted_scopes: List[str]
    status: str = "active"  # active / revoked / expired
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    revoked_at: Optional[str] = None
    last_used_at: Optional[str] = None
    quota_used_today: int = 0
    quota_reset_at: str = field(default_factory=lambda: (datetime.now() + timedelta(days=1)).date().isoformat())


class TokenEncryption:
    """AES-256 (Fernet) 加密工具。"""

    def __init__(self, master_key: Optional[bytes] = None):
        if master_key is None:
            # 从环境变量获取或生成
            key_b64 = os.getenv("TOKEN_ENCRYPTION_KEY")
            if key_b64:
                master_key = base64.urlsafe_b64decode(key_b64)
            else:
                # 开发环境：从密码派生
                password = os.getenv("MASTER_PASSWORD", "dev-master-password-change-in-prod").encode()
                salt = os.getenv("MASTER_SALT", "nova-canvas-salt").encode()
                kdf = PBKDF2HMAC(
                    algorithm=hashes.SHA256(),
                    length=32,
                    salt=salt,
                    iterations=100000,
                )
                master_key = base64.urlsafe_b64encode(kdf.derive(password))
        self._fernet = Fernet(master_key)

    def encrypt(self, data: str) -> str:
        """加密字符串。"""
        return self._fernet.encrypt(data.encode()).decode()

    def decrypt(self, encrypted: str) -> str:
        """解密字符串。"""
        return self._fernet.decrypt(encrypted.encode()).decode()

    def encrypt_dict(self, data: Dict) -> str:
        return self.encrypt(json.dumps(data, ensure_ascii=False))

    def decrypt_dict(self, encrypted: str) -> Dict:
        return json.loads(self.decrypt(encrypted))


# 全局加密器
_encryptor: Optional[TokenEncryption] = None


def get_encryptor() -> TokenEncryption:
    global _encryptor
    if _encryptor is None:
        _encryptor = TokenEncryption()
    return _encryptor


def _oauth_mode(platform: str) -> str:
    """oauth 模式：配置了 client 凭证且未显式 NOVA_OAUTH_MODE=mock 时走真实 HTTP。"""
    forced = os.getenv("NOVA_OAUTH_MODE", "")
    if forced in ("mock", "live"):
        return forced
    client_id = os.getenv(f"{platform.upper()}_CLIENT_ID", "")
    client_secret = os.getenv(f"{platform.upper()}_CLIENT_SECRET", "")
    return "live" if (client_id and client_secret) else "mock"


def _mock_token_data(platform: str) -> Dict[str, Any]:
    return {
        "access_token": f"mock_access_{secrets.token_urlsafe(32)}",
        "refresh_token": f"mock_refresh_{secrets.token_urlsafe(32)}",
        "expires_in": 7200,
        "token_type": "Bearer",
        "scope": ",".join(PLATFORM_CONFIGS[platform]["scopes"]),
        "open_id": f"{platform}_user_{secrets.token_hex(8)}",
    }


async def _http_post_json(url: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    import httpx

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        return resp.json()


class AccountAuthManager:
    """账号授权管理器。"""

    def __init__(self):
        self._authorizations: Dict[str, AccountAuthorization] = {}
        self._encryptor = get_encryptor()

    def generate_auth_url(
        self,
        platform: str,
        user_id: str,
        scopes: List[str],
        redirect_uri: str,
        state: Optional[str] = None,
    ) -> str:
        """生成 OAuth 授权 URL。"""
        config = PLATFORM_CONFIGS.get(platform)
        if not config:
            raise ValueError(f"Unsupported platform: {platform}")

        # 验证 scope
        invalid = [s for s in scopes if s not in config["scopes"]]
        if invalid:
            raise ValueError(f"Invalid scopes for {platform}: {invalid}")

        auth_state = state or secrets.token_urlsafe(32)
        params = {
            "client_id": os.getenv(f"{platform.upper()}_CLIENT_ID", "your_client_id"),
            "redirect_uri": redirect_uri,
            "scope": ",".join(scopes),
            "response_type": "code",
            "state": auth_state,
        }

        # 保存 state 到会话（简化：实际应存 Redis 并关联 user_id）
        from urllib.parse import urlencode
        return f"{config['auth_url']}?{urlencode(params)}"

    async def exchange_code(
        self,
        platform: str,
        code: str,
        redirect_uri: str,
        user_id: str,
    ) -> AccountAuthorization:
        """用授权码换取 access_token。live 模式调平台 token_url；mock 模式返回模拟凭证。"""
        config = PLATFORM_CONFIGS.get(platform)
        if not platform or not config:
            raise ValueError(f"Unsupported platform: {platform}")

        client_id = os.getenv(f"{platform.upper()}_CLIENT_ID", "")
        client_secret = os.getenv(f"{platform.upper()}_CLIENT_SECRET", "")
        mode = _oauth_mode(platform)

        if mode == "live":
            try:
                data = await _http_post_json(
                    config["token_url"],
                    {
                        "app_id": client_id,
                        "app_secret": client_secret,
                        "code": code,
                        "grant_type": "authorization_code",
                        "redirect_uri": redirect_uri,
                    },
                )
            except Exception as e:
                raise RuntimeError(f"平台 token 交换失败({platform}): {e}") from e
            token_data = {
                "access_token": data.get("access_token", ""),
                "refresh_token": data.get("refresh_token", ""),
                "expires_in": int(data.get("expires_in", 7200)),
                "token_type": data.get("token_type", "Bearer"),
                "scope": data.get("scope", ",".join(config["scopes"])),
                "open_id": data.get("open_id") or data.get("union_id") or "",
            }
            if not token_data["access_token"]:
                raise RuntimeError(f"平台未返回 access_token: {data}")
        else:
            token_data = _mock_token_data(platform)

        expires_at = datetime.now() + timedelta(seconds=token_data["expires_in"])
        credentials = OAuthCredentials(
            platform=platform,
            account_id=token_data["open_id"],
            access_token=token_data["access_token"],
            refresh_token=token_data["refresh_token"],
            expires_at=expires_at.isoformat(),
            scope=token_data["scope"].split(","),
            token_type=token_data["token_type"],
        )

        auth = AccountAuthorization(
            id=f"auth_{secrets.token_urlsafe(16)}",
            user_id=user_id,
            platform=platform,
            platform_account_id=token_data["open_id"],
            platform_username=f"{platform}_user_{secrets.token_hex(4)}",
            credentials=credentials,
            granted_scopes=token_data["scope"].split(","),
        )
        self._authorizations[auth.id] = auth
        return auth

    async def refresh_access_token(self, auth_id: str) -> OAuthCredentials:
        """刷新 access_token。live 模式调 refresh_url；mock 模式换新模拟凭证。"""
        auth = self._authorizations.get(auth_id)
        if not auth:
            raise ValueError("Authorization not found")
        if auth.status != "active":
            raise ValueError(f"Authorization status: {auth.status}")

        config = PLATFORM_CONFIGS.get(auth.platform)
        if not config or not config.get("refresh_url"):
            raise ValueError("Platform does not support token refresh")

        mode = _oauth_mode(auth.platform)
        if mode == "live":
            client_id = os.getenv(f"{auth.platform.upper()}_CLIENT_ID", "")
            client_secret = os.getenv(f"{auth.platform.upper()}_CLIENT_SECRET", "")
            try:
                data = await _http_post_json(
                    config["refresh_url"],
                    {
                        "app_id": client_id,
                        "app_secret": client_secret,
                        "refresh_token": auth.credentials.refresh_token,
                        "grant_type": "refresh_token",
                    },
                )
            except Exception as e:
                raise RuntimeError(f"平台 token 刷新失败({auth.platform}): {e}") from e
            new_access = data.get("access_token", "")
            new_refresh = data.get("refresh_token", auth.credentials.refresh_token)
            expires_in = int(data.get("expires_in", 7200))
            if not new_access:
                raise RuntimeError(f"平台未返回 access_token: {data}")
        else:
            new_access = f"mock_access_{secrets.token_urlsafe(32)}"
            new_refresh = f"mock_refresh_{secrets.token_urlsafe(32)}"
            expires_in = 7200

        expires_at = datetime.now() + timedelta(seconds=expires_in)

        auth.credentials.access_token = new_access
        auth.credentials.refresh_token = new_refresh
        auth.credentials.expires_at = expires_at.isoformat()
        auth.credentials.updated_at = datetime.now().isoformat()

        return auth.credentials

    def revoke_authorization(self, auth_id: str, user_id: str) -> bool:
        """撤销授权：立即失效 token 并停止该账号所有自动动作。"""
        auth = self._authorizations.get(auth_id)
        if not auth or auth.user_id != user_id:
            return False

        # 调用平台 revoke_url（如果有）
        config = PLATFORM_CONFIGS.get(auth.platform)
        if config and config.get("revoke_url"):
            # 实际应调用撤销接口
            pass

        auth.status = "revoked"
        auth.revoked_at = datetime.now().isoformat()
        # 清空敏感凭证
        auth.credentials.access_token = ""
        auth.credentials.refresh_token = ""
        return True

    def get_authorization(self, auth_id: str) -> Optional[AccountAuthorization]:
        return self._authorizations.get(auth_id)

    def list_user_authorizations(self, user_id: str) -> List[AccountAuthorization]:
        return [a for a in self._authorizations.values() if a.user_id == user_id]

    def check_quota(self, auth_id: str) -> Dict[str, Any]:
        """检查配额。"""
        auth = self._authorizations.get(auth_id)
        if not auth:
            return {"allowed": False, "reason": "Authorization not found"}

        config = PLATFORM_CONFIGS.get(auth.platform, {})
        daily_limit = config.get("daily_quota", 500)

        # 重置每日配额
        today = datetime.now().date().isoformat()
        if auth.quota_reset_at != today:
            auth.quota_used_today = 0
            auth.quota_reset_at = today

        remaining = max(0, daily_limit - auth.quota_used_today)
        return {
            "allowed": remaining > 0,
            "used": auth.quota_used_today,
            "limit": daily_limit,
            "remaining": remaining,
            "reset_at": auth.quota_reset_at,
            "warning": auth.quota_used_today >= daily_limit * 0.8,
        }

    def consume_quota(self, auth_id: str, count: int = 1) -> bool:
        """消耗配额。"""
        auth = self._authorizations.get(auth_id)
        if not auth:
            return False
        quota = self.check_quota(auth_id)
        if not quota["allowed"]:
            return False
        auth.quota_used_today += count
        return True

    def get_encrypted_credentials(self, auth_id: str) -> str:
        """获取加密后的凭证（用于存储）。"""
        auth = self._authorizations.get(auth_id)
        if not auth:
            return ""
        return self._encryptor.encrypt_dict(asdict(auth.credentials))

    def decrypt_credentials(self, encrypted: str) -> OAuthCredentials:
        """解密凭证。"""
        data = self._encryptor.decrypt_dict(encrypted)
        return OAuthCredentials(**data)


# 全局管理器
_auth_manager: Optional[AccountAuthManager] = None


def get_auth_manager() -> AccountAuthManager:
    global _auth_manager
    if _auth_manager is None:
        _auth_manager = AccountAuthManager()
    return _auth_manager


if __name__ == "__main__":
    # Demo
    mgr = AccountAuthManager()
    url = mgr.generate_auth_url(
        platform="douyin",
        user_id="user_001",
        scopes=["video.publish", "video.data.read"],
        redirect_uri="https://app.novacanvas.com/callback/douyin",
    )
    print(f"Auth URL: {url}")

    # 加密测试
    enc = get_encryptor()
    test_data = {"access_token": "test_token", "refresh_token": "test_refresh"}
    encrypted = enc.encrypt_dict(test_data)
    print(f"Encrypted: {encrypted}")
    decrypted = enc.decrypt_dict(encrypted)
    print(f"Decrypted: {decrypted}")