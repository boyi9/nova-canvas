"""账号授权测试。"""
import pytest
from web.backend.host.account_auth import (
    TokenEncryption,
    AccountAuthManager,
    OAUTH_SCOPES,
    PLATFORM_CONFIGS,
    OAuthCredentials,
    AccountAuthorization,
)


def test_token_encryption():
    """测试 AES-256 加密/解密。"""
    enc = TokenEncryption()
    test_data = {"access_token": "test_token_123", "refresh_token": "refresh_456"}
    encrypted = enc.encrypt_dict(test_data)
    assert isinstance(encrypted, str)
    assert len(encrypted) > 0

    decrypted = enc.decrypt_dict(encrypted)
    assert decrypted == test_data


def test_encrypt_decrypt_string():
    """测试字符串加密。"""
    enc = TokenEncryption()
    text = "secret_access_token_xyz"
    encrypted = enc.encrypt(text)
    decrypted = enc.decrypt(encrypted)
    assert decrypted == text


def test_generate_auth_url():
    """测试生成授权 URL。"""
    mgr = AccountAuthManager()
    url = mgr.generate_auth_url(
        platform="douyin",
        user_id="user_001",
        scopes=["video.publish", "video.data.read"],
        redirect_uri="https://app.novacanvas.com/callback/douyin",
    )
    assert "open.douyin.com" in url
    assert "video.publish" in url
    assert "video.data.read" in url
    assert "redirect_uri" in url


def test_invalid_scope():
    """测试无效 scope 报错。"""
    mgr = AccountAuthManager()
    with pytest.raises(ValueError, match="Invalid scopes"):
        mgr.generate_auth_url(
            platform="douyin",
            user_id="user_001",
            scopes=["invalid_scope"],
            redirect_uri="https://app.novacanvas.com/callback",
        )


def test_platform_configs():
    """测试平台配置完整性。"""
    for platform, config in PLATFORM_CONFIGS.items():
        assert "auth_url" in config
        assert "token_url" in config
        assert "scopes" in config
        assert "daily_quota" in config
        assert isinstance(config["daily_quota"], int)
        assert config["daily_quota"] > 0


def test_oauth_credentials():
    """测试 OAuth 凭证数据类。"""
    creds = OAuthCredentials(
        platform="douyin",
        account_id="dy_123",
        access_token="access_123",
        refresh_token="refresh_456",
        expires_at="2026-12-31T23:59:59",
        scope=["video.publish", "video.data.read"],
    )
    assert creds.platform == "douyin"
    assert "video.publish" in creds.scope


def test_account_authorization():
    """测试授权记录。"""
    from web.backend.host.account_auth import TokenEncryption
    enc = TokenEncryption()

    creds = OAuthCredentials(
        platform="douyin",
        account_id="dy_123",
        access_token="access_123",
        refresh_token="refresh_456",
        expires_at="2026-12-31T23:59:59",
        scope=["video.publish"],
    )

    auth = AccountAuthorization(
        id="auth_001",
        user_id="user_001",
        platform="douyin",
        platform_account_id="dy_123",
        platform_username="test_user",
        credentials=creds,
        granted_scopes=["video.publish"],
    )
    assert auth.user_id == "user_001"
    assert auth.status == "active"
    assert auth.quota_used_today == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])