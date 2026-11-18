import { FileQuestion, Home } from "lucide-react";
import { useTranslation } from "react-i18next";

import { StatePrimaryLink } from "@/components/common/state-actions";
import { StatePage } from "@/components/common/state-page";
import { ROUTES } from "@/router/routes";

export default function NotFound() {
    const { t } = useTranslation();
    return (
        <StatePage
            icon={FileQuestion}
            code="404"
            title={t("notFound.title")}
            description={t("notFound.description")}
            actions={
                <StatePrimaryLink to={ROUTES.nova}>
                    <Home className="size-4" />
                    {t("notFound.home")}
                </StatePrimaryLink>
            }
        />
    );
}
