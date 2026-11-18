import { App, Button, Checkbox, Form, Input } from "antd";
import { Check, LockKeyhole, Mail, MoveLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { ROUTES } from "@/router/routes";

interface LoginValues {
    email: string;
    password: string;
    remember: boolean;
}

const BRAND_HIGHLIGHTS = ["canvas", "models", "agent"] as const;

/**
 * 登录页骨架（/login）。
 *
 * 认证主体在 Go 后端，前端尚未接入登录/刷新流程：这里只提供完整表单与校验，
 * 提交时明确提示"认证服务未接入"，不伪造登录态，也不写入任何令牌。
 */
export default function LoginPage() {
    const { t } = useTranslation();
    const { message } = App.useApp();

    const handleFinish = (values: LoginValues) => {
        void values;
        message.info(t("login.notConnected"));
    };

    return (
        <div className="flex min-h-dvh bg-background text-foreground">
            <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-brand via-indigo-600 to-slate-950 p-12 text-white lg:flex">
                <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-white/10 blur-3xl" aria-hidden />
                <Link to={ROUTES.nova} className="relative inline-flex items-center gap-2 text-sm font-semibold">
                    <span className="size-6 shrink-0 bg-white" style={{ mask: "url(/logo.svg) center / contain no-repeat", WebkitMask: "url(/logo.svg) center / contain no-repeat" }} aria-hidden />
                    {t("meta.title")}
                </Link>

                <div className="relative max-w-md">
                    <h1 className="text-4xl font-semibold leading-tight">{t("login.brandTitle")}</h1>
                    <p className="mt-4 text-sm leading-6 text-white/75">{t("login.brandDescription")}</p>
                    <ul className="mt-8 space-y-3 text-sm text-white/85">
                        {BRAND_HIGHLIGHTS.map((key) => (
                            <li key={key} className="flex items-center gap-2">
                                <Check className="size-4 shrink-0 text-emerald-300" aria-hidden />
                                {t(`login.highlights.${key}`)}
                            </li>
                        ))}
                    </ul>
                </div>

                <p className="relative text-xs text-white/50">{t("login.brandFooter")}</p>
            </aside>

            <main className="flex w-full flex-col px-6 py-8 lg:w-1/2">
                <div className="flex items-center justify-between">
                    <Link to={ROUTES.nova} className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground lg:hidden">
                        <span className="size-5 shrink-0 bg-current" style={{ mask: "url(/logo.svg) center / contain no-repeat", WebkitMask: "url(/logo.svg) center / contain no-repeat" }} aria-hidden />
                        {t("meta.title")}
                    </Link>
                    <Link to={ROUTES.nova} className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground">
                        <MoveLeft className="size-4" aria-hidden />
                        {t("login.backHome")}
                    </Link>
                </div>

                <div className="flex flex-1 items-center justify-center py-10">
                    <div className="w-full max-w-sm">
                        <h2 className="text-2xl font-semibold">{t("login.title")}</h2>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("login.subtitle")}</p>

                        <Form<LoginValues> className="mt-8" layout="vertical" requiredMark={false} size="large" initialValues={{ remember: true }} onFinish={handleFinish}>
                            <Form.Item
                                name="email"
                                label={t("login.email")}
                                rules={[
                                    { required: true, message: t("login.emailRequired") },
                                    { type: "email", message: t("login.emailInvalid") },
                                ]}
                            >
                                <Input prefix={<Mail className="size-4 text-muted-foreground" aria-hidden />} placeholder={t("login.emailPlaceholder")} autoComplete="email" />
                            </Form.Item>

                            <Form.Item name="password" label={t("login.password")} rules={[{ required: true, message: t("login.passwordRequired") }]}>
                                <Input.Password prefix={<LockKeyhole className="size-4 text-muted-foreground" aria-hidden />} placeholder={t("login.passwordPlaceholder")} autoComplete="current-password" />
                            </Form.Item>

                            <div className="mb-6 flex items-center justify-between gap-4">
                                <Form.Item name="remember" valuePropName="checked" noStyle>
                                    <Checkbox>{t("login.remember")}</Checkbox>
                                </Form.Item>
                                <button type="button" className="text-sm text-brand transition hover:underline" onClick={() => message.info(t("login.forgotNotConnected"))}>
                                    {t("login.forgot")}
                                </button>
                            </div>

                            <Button type="primary" htmlType="submit" block size="large">
                                {t("login.submit")}
                            </Button>
                        </Form>

                        <p className="mt-6 text-center text-sm text-muted-foreground">
                            {t("login.noAccount")}{" "}
                            <Link to={ROUTES.onboarding} className="font-medium text-brand transition hover:underline">
                                {t("login.signUp")}
                            </Link>
                        </p>

                        <p className="mt-10 text-center text-xs leading-5 text-muted-foreground">{t("login.guestHint")}</p>
                    </div>
                </div>
            </main>
        </div>
    );
}
