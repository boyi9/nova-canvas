// Command secretctl 生成与使用 NOVA_SECRET_KEY，用于加密「以环境变量下发的敏感配置」
// （例如 AI_PROVIDERS_ENC）。明文只经过进程内存与 stdout，不落盘。
//
// 用法：
//
//	secretctl genkey                    生成新的 32 字节密钥（写入 NOVA_SECRET_KEY）
//	secretctl seal --value '<json>'     加密一段明文（也可从 stdin 读取）
//	secretctl open --value 'v1:...'     解密（校验密钥是否匹配）
//
// 环境变量：
//
//	NOVA_SECRET_KEY   32 字节密钥的 base64url 编码（seal/open 必需）
//
// 输出保持 ASCII，避免 Windows GBK 代码页下中文乱码。
package main

import (
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	"nova-canvas-backend/internal/security"
)

func main() {
	if len(os.Args) < 2 {
		usage()
	}
	switch os.Args[1] {
	case "genkey":
		key, err := security.GenerateKeyBase64()
		if err != nil {
			fail(err)
		}
		fmt.Println(key)
	case "seal":
		box := mustBox()
		fmt.Println(mustSeal(box, readInput("seal")))
	case "open":
		box := mustBox()
		plaintext, err := box.Open(strings.TrimSpace(readInput("open")))
		if err != nil {
			fail(err)
		}
		fmt.Println(plaintext)
	default:
		usage()
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "Usage: secretctl <genkey|seal|open> [--value <text>]")
	fmt.Fprintln(os.Stderr, "  genkey          Generate NOVA_SECRET_KEY (base64url, 32 bytes)")
	fmt.Fprintln(os.Stderr, "  seal            Encrypt plaintext (--value or stdin)")
	fmt.Fprintln(os.Stderr, "  open            Decrypt ciphertext (--value or stdin)")
	os.Exit(2)
}

func fail(err error) {
	fmt.Fprintf(os.Stderr, "secretctl: %v\n", err)
	os.Exit(1)
}

func mustBox() *security.SecretBox {
	box, err := security.LoadSecretBoxFromEnv()
	if err != nil {
		fail(err)
	}
	if box == nil {
		fail(fmt.Errorf("%s is not set", security.SecretKeyEnv))
	}
	return box
}

// readInput 优先取 --value，其次读 stdin。
func readInput(command string) string {
	fs := flag.NewFlagSet(command, flag.ExitOnError)
	value := fs.String("value", "", "plaintext (seal) or ciphertext (open)")
	_ = fs.Parse(os.Args[2:])
	if strings.TrimSpace(*value) != "" {
		return strings.TrimSpace(*value)
	}
	data, err := io.ReadAll(os.Stdin)
	if err != nil {
		fail(err)
	}
	text := strings.TrimSpace(string(data))
	if text == "" {
		fail(fmt.Errorf("no input: pass --value or pipe text on stdin"))
	}
	return text
}

func mustSeal(box *security.SecretBox, plaintext string) string {
	sealed, err := box.Seal(plaintext)
	if err != nil {
		fail(err)
	}
	return sealed
}
