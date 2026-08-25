import { useEffect, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button, Input, List, Modal, Spin, message } from "antd";
import { useTranslation } from "react-i18next";

import { applyRecipe, listRecipes, saveRecipe, type Recipe, type RecipeVariable } from "@/services/nova/api";
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
    const [activeRecipe, setActiveRecipe] = useState<Recipe | null>(null);
    const [values, setValues] = useState<Record<string, string>>({});

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
            setActiveRecipe(null);
            setValues({});
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

    const beginApply = (recipe: Recipe) => {
        const vars = recipe.variables ?? [];
        if (vars.length === 0) {
            void doApply(recipe, {});
            return;
        }
        const initial: Record<string, string> = {};
        for (const variable of vars) {
            initial[variable.name] = variable.default != null ? String(variable.default) : "";
        }
        setActiveRecipe(recipe);
        setValues(initial);
    };

    const doApply = async (recipe: Recipe, raw: Record<string, string>) => {
        try {
            const { graph } = await applyRecipe(recipe.id ?? "", raw);
            const { nodes, connections } = instantiateRecipeGraph(graph, { x: 80, y: 80 });
            onApplyGraph(nodes, connections);
            message.success(t("canvas.recipeApplied"));
            onClose();
        } catch {
            message.error(t("canvas.recipeApplyFailed"));
        }
    };

    const confirmApply = () => {
        if (!activeRecipe) return;
        void doApply(activeRecipe, values);
    };

    return (
        <Modal open={open} onCancel={onClose} footer={null} title={t("canvas.recipe")} width={560} destroyOnClose>
            <div className="space-y-4">
                {activeRecipe ? (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="text-sm font-medium">{activeRecipe.name}</div>
                            <Button type="link" onClick={() => setActiveRecipe(null)}>
                                {t("canvas.recipeBack")}
                            </Button>
                        </div>
                        <div className="space-y-2">
                            {(activeRecipe.variables ?? []).map((variable: RecipeVariable) => (
                                <div key={variable.name} className="flex flex-col gap-1">
                                    <span className="text-xs opacity-60">{`{{${variable.name}}}`}</span>
                                    <Input
                                        value={values[variable.name] ?? ""}
                                        onChange={(event) => setValues((prev) => ({ ...prev, [variable.name]: event.target.value }))}
                                        placeholder={variable.description || variable.name}
                                    />
                                </div>
                            ))}
                        </div>
                        <Button type="primary" block icon={<Download className="size-4" />} onClick={confirmApply}>
                            {t("canvas.recipeConfirmApply")}
                        </Button>
                    </div>
                ) : (
                    <>
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
                                                onClick={() => beginApply(recipe)}
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
                    </>
                )}
            </div>
        </Modal>
    );
}
