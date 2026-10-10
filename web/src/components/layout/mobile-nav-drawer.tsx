import { Drawer } from "antd";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { navigationGroupOrder, toolsByGroup, type NavigationToolSlug } from "@/constant/navigation-tools";
import { cn } from "@/lib/utils";

type MobileNavDrawerProps = {
    open: boolean;
    activeToolSlug?: NavigationToolSlug;
    onClose: () => void;
};

export function MobileNavDrawer({ open, activeToolSlug, onClose }: MobileNavDrawerProps) {
    const { t } = useTranslation();

    return (
        <Drawer title={t("topNav.navigation")} placement="left" size={280} open={open} onClose={onClose} className="md:hidden">
            <div className="space-y-4">
                {navigationGroupOrder.map((groupId) => (
                    <div key={groupId}>
                        <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground dark:text-muted-foreground">{t(`navGroup.${groupId}`)}</p>
                        <div className="space-y-1">
                            {toolsByGroup(groupId).map((tool) => {
                                const Icon = tool.icon;
                                const active = tool.slug === activeToolSlug;
                                return (
                                    <Link
                                        key={tool.slug}
                                        to={`/${tool.slug}`}
                                        onClick={onClose}
                                        className={cn(
                                            "flex items-center gap-3 rounded-lg px-3 py-3 text-base transition",
                                            active ? "bg-muted font-medium text-foreground dark:bg-card dark:text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground dark:text-muted-foreground dark:hover:bg-card dark:hover:text-foreground",
                                        )}
                                    >
                                        <Icon className="size-5" />
                                        <span>{t(`navigation.${tool.slug}`)}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </Drawer>
    );
}
