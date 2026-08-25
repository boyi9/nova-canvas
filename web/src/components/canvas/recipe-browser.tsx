import { useEffect, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button, Input, List, Modal, Spin, message } from "antd";
import { useTranslation } from "react-i18next";

import { applyRecipe, listRecipes, saveRecipe, type Recipe } from "@/services/nova/api";
import { canvasToRecipeGraph, extractVariables, instantiateRecipeGraph } from "@/lib/canvas/recipe-adapter";
import type { CanvasConnection, CanvasNodeData } from "@/types/canvas";

export interface CanvasSnapshot {
    title: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
}

interface RecipeBrowserProps {
    open: boolean;
    onClose: () => void;
    onApplyGraph: (nodes: CanvasNodeData[], connections: CanvasConnection[]) => void;
    getSnapshot: () => CanvasSnapshot;
}

export function RecipeBrowser({ open, onClose, onApplyGraph, getSnapshot }: RecipeBrowserProps) {
    const { t } = useTranslation();
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [name, setName] = useState("");

    const load = async () => {
        setLoading(true);
        try {
            const data = await listRecipes();
            setRecipes(data.recipes ?? []);
        } catch {
            message.error(t("canvas.recipeLoadFailed"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open) {
            setName("");
            void load();
        }
    }, [open]);

    const handleSave = async () => {
        const snapshot = getSnapshot();
        if (!snapshot.nodes.length) {
            message.warning(t("canvas.recipeEmptyCanvas"));
            return;
        }
        const trimmed = name.trim();
        if (!trimmed) {
            message.warning(t("canvas.recipeNameRequired"));
            return;
        }
        setSaving(true);
        try {
            const graph = canvasToRecipeGraph(snapshot.nodes, snapshot.connections);
            const variables = extractVariables(snapshot.nodes).map((value) => ({ name: value }));
            await saveRecipe({ name: trimmed, graph, variables, description: snapshot.title });
            message.success(t("canvas.recipeSaved"));
            setName("");
            await load();
        } catch {
            message.error(t("canvas.recipeSaveFailed"));
        } finally {
            setSaving(false);
        }
    };

    const handleApply = async (id: string) => {
        try {
            const { graph } = await applyRecipe(id);
            const { nodes, connections } = instantiateRecipeGraph(graph, { x: 80, y: 80 });
            onApplyGraph(nodes, connections);
            message.success(t("canvas.recipeApplied"));
            onClose();
        } catch {
            message.error(t("canvas.recipeApplyFailed"));
        }
    };

    return (
        <Modal open={open} onCancel={onClose} footer={null} title={t("canvas.recipe")} width={560} destroyOnClose>
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <Input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder={t("canvas.recipeNamePlaceholder")}
                        onPressEnter={handleSave}
                    />
                    <Button type="primary" icon={<Upload className="size-4" />} loading={saving} onClick={handleSave}>
                        {t("canvas.recipeSave")}
                    </Button>
                </div>
                {loading ? (
                    <div className="grid place-items-center py-10">
                        <Spin />
                    </div>
                ) : recipes.length === 0 ? (
                    <div className="py-10 text-center text-sm opacity-60">{t("canvas.recipeEmpty")}</div>
                ) : (
                    <List
                        dataSource={recipes}
                        renderItem={(recipe) => (
                            <List.Item
                                actions={[
                                    <Button
                                        key="apply"
                                        type="link"
                                        icon={<Download className="size-4" />}
                                        onClick={() => handleApply(recipe.id ?? "")}
                                    >
                                        {t("canvas.recipeApply")}
                                    </Button>,
                                ]}
                            >
                                <List.Item.Meta
                                    title={recipe.name}
                                    description={
                                        recipe.description ||
                                        (recipe.variables && recipe.variables.length
                                            ? recipe.variables.map((variable) => `{{${variable.name}}}`).join(" ")
                                            : "")
                                    }
                                />
                            </List.Item>
                        )}
                    />
                )}
            </div>
        </Modal>
    );
}
