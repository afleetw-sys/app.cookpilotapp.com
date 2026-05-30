"use client";

import Image from "next/image";
import {
  ArrowClockwise,
  ArrowLeft,
  ArrowUpRight,
  Fire,
  FloppyDisk,
  PencilSimple,
  Plus,
  ShareNetwork,
  Timer,
  Trash,
  X,
} from "@phosphor-icons/react";
import { doc, onSnapshot } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { AIEditSection } from "@/components/cookpilot/AIEditSection";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  IngredientMeasurementDropdown,
  IngredientsServingsControl,
  ServingsMultiplierPills,
} from "@/components/cookpilot/IngredientsSectionToolbar";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StateBlock } from "@/components/ui/StateBlock";
import { TagIconGlyph } from "@/components/ui/TagIconGlyph";
import { TextField } from "@/components/ui/TextField";
import {
  displayIngredient,
  measurementModeFromRaw,
  recipeIngredientMeasurementDominance,
  showConvertedMeasurements,
  type MeasurementMode,
} from "@/lib/cookpilot/ingredientDisplay";
import {
  buildSavedRecipe,
  decodeRecipeSummary,
  deleteRecipe,
  loadRecipePage,
  loadRecipeWithSummaryDoc,
  saveRecipe,
  updateRecipeDetailPreferences,
  updateThemeSeedColors,
} from "@/lib/cookpilot/firestore";
import { extractThemeSeedColors } from "@/lib/cookpilot/extractTheme";
import {
  deleteRecipeImageFromFirebaseStorage,
  isFirebaseStorageURL,
  uploadRecipeImage,
} from "@/lib/cookpilot/imageStorage";
import { clearPendingImportDraft, loadPendingImportDraft } from "@/lib/cookpilot/importDraft";
import { recordRecipeViewedAt } from "@/lib/cookpilot/recentlyViewed";
import { useResolvedRecipeCoverSrc } from "@/lib/cookpilot/useResolvedRecipeCoverSrc";
import { useClickOutside } from "@/lib/useClickOutside";
import { editRecipe, createShareLink, deleteShareLink } from "@/lib/cookpilot/functions";
import { buildShareLinkPayload } from "@/lib/cookpilot/sharedRecipe";
import { defaultAIEditSuggestions } from "@/lib/cookpilot/editSuggestions";
import { knownTagsFromRecipes } from "@/lib/cookpilot/recipeBrowse";
import { getRecipesBrowseSessionCache, removeRecipeFromBrowseSessionCache, syncSavedRecipeToBrowseSessionCache, updateRecipeSummaryInBrowseSessionCache, upsertSavedRecipeInBrowseSessionCache } from "@/lib/cookpilot/recipesBrowseSessionCache";
import { scaleRecipe } from "@/lib/cookpilot/scaling";
import { buildRecipePalette } from "@/lib/cookpilot/theme";
import type { EditRecipeResponse, RecipeData, SavedRecipe } from "@/lib/cookpilot/types";
import { auth } from "@/lib/firebase/client";
import { db } from "@/lib/firebase/db";

type EditState = {
  prompt: string;
  loading: boolean;
  error: string | null;
  refusal: string | null;
  result: EditRecipeResponse | null;
};

const SYSTEM_TAGS = new Set([
  "Quick",
  "Dessert",
  "Breakfast",
  "Appetizer",
  "Soup",
  "Drink",
  "Vegetarian",
  "Fish",
]);

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function shouldOfferTagSuggestion(tag: string, recipeTitle?: string | null) {
  if (tag !== "Vegetarian") return true;
  const words = new Set((recipeTitle ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  return words.has("vegetarian");
}

function parseTimeValue(value: string): { hours: number; minutes: number } {
  const hrMatch = /(\d+)\s*(?:hr|hour)/i.exec(value);
  const minMatch = /(\d+)\s*(?:min|minute)/i.exec(value);
  return {
    hours: hrMatch ? parseInt(hrMatch[1], 10) : 0,
    minutes: minMatch ? parseInt(minMatch[1], 10) : 0,
  };
}

function formatTimeValue(hours: number, minutes: number): string | null {
  if (hours === 0 && minutes === 0) return null;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} hr`);
  if (minutes > 0) parts.push(`${minutes} min`);
  return parts.join(" ");
}

const MINUTE_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function TimePickerField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const { hours, minutes } = parseTimeValue(value ?? "");
  const snapped = Math.round(minutes / 5) * 5;
  const snappedMinutes = MINUTE_OPTIONS.includes(minutes) ? minutes : (snapped >= 60 ? 55 : snapped);

  return (
    <div className="cp-time-picker">
      <span className="cp-time-picker__label">{label}</span>
      <div className="cp-time-picker__selects">
        <div className="cp-time-picker__select-wrap">
          <select
            className="cp-time-picker__select"
            value={hours}
            onChange={(e) => onChange(formatTimeValue(parseInt(e.target.value, 10), snappedMinutes))}
          >
            {Array.from({ length: 13 }, (_, i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
          <span className="cp-time-picker__unit">hr</span>
        </div>
        <div className="cp-time-picker__select-wrap">
          <select
            className="cp-time-picker__select"
            value={snappedMinutes}
            onChange={(e) => onChange(formatTimeValue(hours, parseInt(e.target.value, 10)))}
          >
            {MINUTE_OPTIONS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <span className="cp-time-picker__unit">min</span>
        </div>
      </div>
    </div>
  );
}

function orderedTags(recipe: RecipeData) {
  return [...(recipe.systemTags ?? []), ...(recipe.tags ?? [])].filter(Boolean);
}

function parseServingsInput(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 1;

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return null;

  return parsed;
}

function cleanOptional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizedEditableDraft(recipe: SavedRecipe): SavedRecipe {
  const draft = structuredClone(recipe) as SavedRecipe;

  draft.recipe.ingredientSections = draft.recipe.ingredientSections.length > 0
    ? draft.recipe.ingredientSections.map((section) => ({
        ...section,
        id: section.id || makeId(),
        ingredients: section.ingredients.map((ingredient) => ({
          ...ingredient,
          id: ingredient.id || makeId(),
        })),
      }))
    : [{ id: makeId(), title: null, ingredients: [] }];

  if (draft.recipe.ingredientSections.every((section) => section.ingredients.length === 0)) {
    draft.recipe.ingredientSections[0].ingredients = [{ id: makeId(), name: "" }];
  }

  draft.recipe.instructionSections = draft.recipe.instructionSections.length > 0
    ? draft.recipe.instructionSections.map((section) => ({
        ...section,
        id: section.id || makeId(),
        instructions: section.instructions.map((instruction, index) => ({
          ...instruction,
          id: instruction.id || makeId(),
          stepNumber: instruction.stepNumber || index + 1,
        })),
      }))
    : [{ id: makeId(), title: null, instructions: [] }];

  if (draft.recipe.instructionSections.every((section) => section.instructions.length === 0)) {
    draft.recipe.instructionSections[0].instructions = [{ id: makeId(), stepNumber: 1, text: "" }];
  }

  return draft;
}

function renumberInstructions(recipe: RecipeData): RecipeData {
  let stepNumber = 1;
  return {
    ...recipe,
    instructionSections: recipe.instructionSections.map((section) => ({
      ...section,
      instructions: section.instructions.map((instruction) => ({
        ...instruction,
        stepNumber: stepNumber++,
      })),
    })),
  };
}

function DetailSection({
  title,
  titleAddon,
  titleBelow,
  action,
  bare = false,
  children,
}: {
  title: string;
  titleAddon?: React.ReactNode;
  titleBelow?: React.ReactNode;
  action?: React.ReactNode;
  bare?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={bare ? "cp-detail__section-card" : "cp-panel cp-panel--section"}>
      <SectionHeader title={title} titleAddon={titleAddon} titleBelow={titleBelow}>
        {action}
      </SectionHeader>
      {children}
    </section>
  );
}

function generateShareableText(recipe: RecipeData, sourceURL?: string | null) {
  const sections: string[] = [];
  const title = recipe.title?.trim() || "Recipe";
  const ingredients = recipe.ingredientSections.flatMap((section) => section.ingredients);
  const instructions = recipe.instructionSections.flatMap((section) => section.instructions);

  sections.push(title);

  const metadata: string[] = [];
  if (recipe.prepTime && recipe.cookTime) {
    metadata.push(`Prep: ${recipe.prepTime} | Cook: ${recipe.cookTime}`);
  } else if (recipe.prepTime) {
    metadata.push(`Prep: ${recipe.prepTime}`);
  } else if (recipe.cookTime) {
    metadata.push(`Cook: ${recipe.cookTime}`);
  }
  if (recipe.servings) {
    metadata.push(`Servings: ${recipe.servings}`);
  }
  if (metadata.length > 0) {
    sections.push(metadata.join("\n"));
  }

  if (ingredients.length > 0) {
    sections.push(`INGREDIENTS:\n${ingredients.map((ingredient) => `- ${ingredient.name}`).join("\n")}`);
  }

  if (instructions.length > 0) {
    sections.push(
      `INSTRUCTIONS:\n${instructions
        .map((instruction, index) => `${index + 1}. ${instruction.text}`)
        .join("\n\n")}`,
    );
  }

  let footer = "Shared from CookPilot\nSave and tweak recipes with AI";
  if (sourceURL) {
    footer += `\n\nOriginal recipe: ${sourceURL}`;
  }
  sections.push(footer);

  return sections.join("\n\n");
}

function RecipeTagChip({
  tag,
  visualIndex,
  isEditing = false,
  isSystemTag = false,
  onRemove,
}: {
  tag: string;
  visualIndex: number;
  isEditing?: boolean;
  isSystemTag?: boolean;
  onRemove?: () => void;
}) {
  const classes = [
    "cp-detail__tag",
    isEditing ? "cp-detail__tag--editable" : "",
    isSystemTag ? "cp-detail__tag--system" : "",
  ].filter(Boolean).join(" ");

  const content = (
    <>
      <TagIconGlyph tag={tag} />
      <span>{tag}</span>
      {isEditing ? <X size={12} weight="bold" /> : null}
    </>
  );

  if (isEditing) {
    return (
      <button
        className={classes}
        onClick={onRemove}
        style={{ "--tag-rotation-index": visualIndex } as React.CSSProperties}
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <span
      className={classes}
      style={{ "--tag-rotation-index": visualIndex } as React.CSSProperties}
    >
      {content}
    </span>
  );
}

export function RecipeDetailPage({ recipeId, isDraft = false }: { recipeId: string; isDraft?: boolean }) {
  const router = useRouter();
  const { user, status } = useAuth();
  const [selectedRecipe, setSelectedRecipe] = useState<SavedRecipe | null>(null);
  const [loadingRecipeDetail, setLoadingRecipeDetail] = useState(true);
  const [showDetailSpinner, setShowDetailSpinner] = useState(false);
  const [servingsOverride, setServingsOverride] = useState<number | null>(null);
  const [checkedIngredientIndices, setCheckedIngredientIndices] = useState<number[]>([]);
  const {
    src: resolvedDetailImageSrc,
    failed: detailImageFailed,
    handleImageError: handleDetailImageError,
  } = useResolvedRecipeCoverSrc(selectedRecipe?.recipe.imageURL, recipeId);
  const [measurementMode, setMeasurementMode] = useState<MeasurementMode>("original");
  const [showMeasurementMenu, setShowMeasurementMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingRecipe, setDeletingRecipe] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [localImagePreview, setLocalImagePreview] = useState<string | null>(null);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const measurementMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const detailInitializedRef = useRef(false);
  const [editState, setEditState] = useState<EditState>({
    prompt: "",
    loading: false,
    error: null,
    refusal: null,
    result: null,
  });
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [isEditingRecipe, setIsEditingRecipe] = useState(false);
  const [editDraft, setEditDraft] = useState<SavedRecipe | null>(null);
  // True while the recipe exists only in sessionStorage (not yet saved to Firestore).
  // Flips to false on the first Save, which triggers the Firestore subscription.
  const [isPendingDraft, setIsPendingDraft] = useState(isDraft);
  const [newTag, setNewTag] = useState("");
  const [allKnownTags, setAllKnownTags] = useState<string[]>([]);
  const [saveEditError, setSaveEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(
      () => setShowDetailSpinner(loadingRecipeDetail),
      loadingRecipeDetail ? 200 : 0,
    );
    return () => clearTimeout(t);
  }, [loadingRecipeDetail]);

  useEffect(() => {
    if (!user || isPendingDraft) return;
    detailInitializedRef.current = false;
    const userId = user.uid;

    const unsub = onSnapshot(
      doc(db, "users", userId, "recipes", recipeId),
      async (summarySnap) => {
        if (!summarySnap.exists()) {
          setSelectedRecipe(null);
          setLoadingRecipeDetail(false);
          return;
        }

        if (!detailInitializedRef.current) {
          detailInitializedRef.current = true;
          const recipe = await loadRecipeWithSummaryDoc(userId, recipeId, summarySnap);
          setSelectedRecipe(recipe);
          syncSavedRecipeToBrowseSessionCache(userId, recipe);
          setCheckedIngredientIndices(recipe.checkedIngredientIndices ?? []);
          setMeasurementMode(
            measurementModeFromRaw(recipe.preferredIngredientMeasurementRaw),
          );
          setShowMeasurementMenu(false);
          setLoadingRecipeDetail(false);
          return;
        }

        // Subsequent summary-doc writes (e.g. theme extraction): update summary fields
        // without re-fetching the detail doc, which hasn't changed.
        const summary = decodeRecipeSummary(summarySnap);
        setSelectedRecipe((current) => {
          if (!current) return current;
          return {
            ...current,
            recipe: {
              ...current.recipe,
              title: summary.title,
              imageURL: summary.imageURL ?? null,
              localImagePath: summary.localImagePath ?? null,
              tags: summary.tags,
              systemTags: summary.systemTags,
            },
            sourceURL: summary.sourceURL ?? null,
            preferredServings: summary.preferredServings ?? null,
            totalTimeMinutes: summary.totalTimeMinutes ?? null,
            themeSeedColors: summary.themeSeedColors ?? null,
          };
        });
        updateRecipeSummaryInBrowseSessionCache(userId, recipeId, {
          imageURL: summary.imageURL ?? null,
          title: summary.title ?? null,
          tags: summary.tags,
          systemTags: summary.systemTags,
          totalTimeMinutes: summary.totalTimeMinutes ?? null,
        });
      },
      (error) => {
        console.error(error);
        setLoadingRecipeDetail(false);
      },
    );

    return unsub;
  }, [recipeId, user, isPendingDraft]);

  // Initialize recipe from sessionStorage when navigating here right after import.
  // The recipe isn't in Firestore yet — that first write happens on Save.
  useEffect(() => {
    if (!isPendingDraft || !user) return;
    const draft = loadPendingImportDraft(recipeId);
    if (!draft) {
      router.replace("/recipes");
      return;
    }
    const pending = buildSavedRecipe({ id: recipeId, recipe: draft.recipe, sourceURL: draft.sourceURL });
    setSelectedRecipe(pending);
    setEditDraft(normalizedEditableDraft(pending));
    setIsEditingRecipe(true);
    setLoadingRecipeDetail(false);
  }, [isPendingDraft, recipeId, user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    const cached = getRecipesBrowseSessionCache(user.uid);
    setAllKnownTags(cached ? knownTagsFromRecipes(cached.recipes) : []);
  }, [user]);

  useEffect(() => {
    if (!user || !isEditingRecipe) return;
    if (getRecipesBrowseSessionCache(user.uid)) return;

    let cancelled = false;
    const userId = user.uid;

    void loadRecipePage(userId, null)
      .then((page) => {
        if (cancelled) return;
        setAllKnownTags(knownTagsFromRecipes(page.recipes));
      })
      .catch((error) => {
        console.error(error);
      });

    return () => {
      cancelled = true;
    };
  }, [user, isEditingRecipe]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [recipeId]);

  useEffect(() => {
    return () => {
      if (localImagePreview?.startsWith("blob:")) {
        URL.revokeObjectURL(localImagePreview);
      }
    };
  }, [localImagePreview]);

  // Extract palette from the recipe image if not yet available (mirrors iOS lazy extraction on view load)
  useEffect(() => {
    if (!user || !selectedRecipe) return;
    if (isEditingRecipe || uploadingImage || localImagePreview) return;
    if (selectedRecipe.themeSeedColors) return;
    const imageUrl = resolvedDetailImageSrc ?? selectedRecipe.recipe.imageURL;
    if (!imageUrl) return;
    if (!imageUrl.startsWith("http") || !imageUrl.includes("firebasestorage.googleapis.com")) return;

    const userId = user.uid;
    let cancelled = false;

    void extractThemeSeedColors(imageUrl).then((seed) => {
      if (cancelled || !seed) return;
      setSelectedRecipe((current) =>
        current?.id === recipeId ? { ...current, themeSeedColors: seed } : current,
      );
      void updateThemeSeedColors(userId, recipeId, seed);
    });

    return () => { cancelled = true; };
  }, [user, selectedRecipe, recipeId, isEditingRecipe, uploadingImage, localImagePreview, resolvedDetailImageSrc]);

  useClickOutside(measurementMenuRef, useCallback(() => setShowMeasurementMenu(false), []));

  async function handleDeleteRecipe() {
    if (!user || !selectedRecipe) return;
    setDeletingRecipe(true);
    setDeleteError(null);
    try {
      // Mirror iOS RecipeStorageService.deleteFromCloud: delete Firebase Storage
      // thumbnail before the Firestore documents so orphaned objects don't accumulate.
      const imageURL = selectedRecipe.recipe.imageURL;
      if (imageURL && isFirebaseStorageURL(imageURL)) {
        await deleteRecipeImageFromFirebaseStorage(imageURL);
      }
      await deleteRecipe(user.uid, selectedRecipe.id);
      removeRecipeFromBrowseSessionCache(user.uid, selectedRecipe.id);
      router.push("/recipes");
    } catch (error) {
      console.error(error);
      setDeletingRecipe(false);
      setShowDeleteConfirm(false);
      setDeleteError("We couldn't delete that recipe. Please try again.");
    }
  }

  async function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !user || !editDraft || status === "anonymous") return;
    event.target.value = "";
    setImageUploadError(null);

    if (localImagePreview?.startsWith("blob:")) {
      URL.revokeObjectURL(localImagePreview);
    }
    const blobPreview = URL.createObjectURL(file);
    setLocalImagePreview(blobPreview);
    setUploadingImage(true);

    try {
      const url = await uploadRecipeImage(user.uid, editDraft.id, file);
      updateDraftRecipe((recipe) => ({ ...recipe, imageURL: url }));
      setEditDraft((current) => current ? { ...current, sourceURL: current.sourceURL || "photo_upload" } : current);
      // Keep blob preview so the UI does not depend on the network URL loading during edit.
    } catch (error) {
      console.warn("Upload failed", {
        errorCode: (error as { code?: string }).code,
        errorMessage: (error as { message?: string }).message,
        reactUserId: user.uid,
        firebaseCurrentUserId: auth.currentUser?.uid ?? null,
        isAnonymous: auth.currentUser?.isAnonymous ?? null,
        status,
      });
      setImageUploadError("We couldn’t upload that photo. Please try again.");
      URL.revokeObjectURL(blobPreview);
      setLocalImagePreview(null);
    } finally {
      setUploadingImage(false);
    }
  }

  function handleRemoveImage() {
    if (localImagePreview?.startsWith("blob:")) {
      URL.revokeObjectURL(localImagePreview);
    }
    setLocalImagePreview(null);
    setImageUploadError(null);
    updateDraftRecipe((recipe) => ({ ...recipe, imageURL: null, localImagePath: null }));
  }

  function handleEditImagePreviewError() {
    if (uploadingImage || localImagePreview?.startsWith("blob:")) return;
    handleRemoveImage();
  }

  const persistIngredientPreferences = useCallback(
    async (params: {
      checkedIngredientIndices?: number[];
      preferredIngredientMeasurementRaw?: string | null;
    }) => {
      if (!user) return;
      const userId = user.uid;

      try {
        await updateRecipeDetailPreferences({
          userId,
          recipeId,
          ...params,
        });
      } catch (error) {
        console.error(error);
      }
    },
    [recipeId, user],
  );

  async function persistRecipe(userId: string, updatedRecipe: SavedRecipe) {
    await saveRecipe(userId, updatedRecipe);
    setSelectedRecipe(updatedRecipe);
    syncSavedRecipeToBrowseSessionCache(userId, updatedRecipe);
  }

  const scaledRecipe = useMemo(() => {
    if (!selectedRecipe) return null;
    if (!servingsOverride) return selectedRecipe.recipe;
    return scaleRecipe(selectedRecipe.recipe, servingsOverride);
  }, [selectedRecipe, servingsOverride]);
  const recipePalette = useMemo(() => {
    const seed = selectedRecipe?.themeSeedColors;
    return seed ? buildRecipePalette(seed) : null;
  }, [selectedRecipe?.themeSeedColors]);

  async function handleEditRecipe(promptOverride?: string) {
    const prompt = (promptOverride ?? editState.prompt).trim();
    if (!user || !selectedRecipe || !prompt) return;
    const userId = user.uid;
    const baseRecipeForEdit = isEditingRecipe && editDraft ? editDraft.recipe : selectedRecipe.recipe;

    setEditState((current) => ({
      ...current,
      prompt: promptOverride ?? current.prompt,
      loading: true,
      error: null,
      refusal: null,
      result: null,
    }));

    try {
      const result = await editRecipe({
        recipeId: selectedRecipe.id,
        recipe: baseRecipeForEdit,
        userRequest: prompt,
      });

      if (result.outcome === "refused") {
        setEditState((current) => ({
          ...current,
          loading: false,
          refusal: result.refusalReason ?? "That request didn’t fit this recipe.",
          result,
        }));
        return;
      }

      if (isEditingRecipe && editDraft) {
        setEditDraft((current) =>
          current
            ? {
                ...current,
                recipe: {
                  ...result.recipe,
                  tags: result.recipe.tags ?? current.recipe.tags,
                  systemTags: result.recipe.systemTags ?? current.recipe.systemTags,
                },
              }
            : current,
        );
        setEditState({
          prompt: "",
          loading: false,
          error: null,
          refusal: null,
          result,
        });
        return;
      }

      const updatedRecipe = buildSavedRecipe({
        id: selectedRecipe.id,
        recipe: result.recipe,
        sourceURL: selectedRecipe.sourceURL,
        createdAt: selectedRecipe.createdAt,
        preferredServings: selectedRecipe.preferredServings,
        checkedIngredientIndices: selectedRecipe.checkedIngredientIndices,
        preferredIngredientMeasurementRaw: selectedRecipe.preferredIngredientMeasurementRaw,
        themeSeedColors: selectedRecipe.themeSeedColors,
      });

      await persistRecipe(userId, updatedRecipe);
      setEditState({
        prompt: "",
        loading: false,
        error: null,
        refusal: null,
        result,
      });
    } catch (error) {
      console.error(error);
      setEditState((current) => ({
        ...current,
        loading: false,
        error: "The recipe edit didn’t go through. Please try again.",
      }));
    }
  }

  function handleEditClick() {
    if (!selectedRecipe) return;
    setEditDraft(normalizedEditableDraft(selectedRecipe));
    setServingsOverride(null);
    setSaveEditError(null);
    setDeleteError(null);
    setImageUploadError(null);
    setLocalImagePreview(null);
    setIsEditingRecipe(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => {
      document.querySelector<HTMLInputElement>(".cp-inline-editor input")?.focus();
    }, 240);
  }

  function handleCancelEdit() {
    if (localImagePreview?.startsWith("blob:")) {
      URL.revokeObjectURL(localImagePreview);
    }
    setLocalImagePreview(null);
    setImageUploadError(null);
    setIsEditingRecipe(false);
    setEditDraft(null);
    setNewTag("");
    setSaveEditError(null);
    setDeleteError(null);
    if (isPendingDraft) {
      clearPendingImportDraft(recipeId);
      router.push("/recipes");
    }
  }

  async function handleSaveManualEdit() {
    if (!user || !selectedRecipe || !editDraft) return;

    const recipe = renumberInstructions({
      ...editDraft.recipe,
      title: cleanOptional(editDraft.recipe.title ?? ""),
      prepTime: cleanOptional(editDraft.recipe.prepTime ?? ""),
      cookTime: cleanOptional(editDraft.recipe.cookTime ?? ""),
      ingredientSections: editDraft.recipe.ingredientSections
        .map((section) => ({
          ...section,
          ingredients: section.ingredients.filter((ingredient) => ingredient.name.trim().length > 0),
        }))
        .filter((section) => section.ingredients.length > 0),
      instructionSections: editDraft.recipe.instructionSections
        .map((section) => ({
          ...section,
          instructions: section.instructions.filter((instruction) => instruction.text.trim().length > 0),
        }))
        .filter((section) => section.instructions.length > 0),
    });

    const checkedCount = recipe.ingredientSections.reduce(
      (total, section) => total + section.ingredients.length,
      0,
    );
    const nextCheckedIngredientIndices = checkedIngredientIndices
      .filter((index) => index < checkedCount);

    setSavingEdit(true);
    setSaveEditError(null);

    try {
      const updatedRecipe = buildSavedRecipe({
        id: selectedRecipe.id,
        recipe: {
          ...recipe,
          ingredientSections: recipe.ingredientSections.length > 0
            ? recipe.ingredientSections
            : [{ id: makeId(), title: null, ingredients: [] }],
          instructionSections: recipe.instructionSections.length > 0
            ? recipe.instructionSections
            : [{ id: makeId(), title: null, instructions: [] }],
        },
        sourceURL: cleanOptional(editDraft.sourceURL ?? ""),
        createdAt: selectedRecipe.createdAt,
        preferredServings: recipe.servings ?? selectedRecipe.preferredServings,
        checkedIngredientIndices: nextCheckedIngredientIndices,
        preferredIngredientMeasurementRaw: selectedRecipe.preferredIngredientMeasurementRaw,
        themeSeedColors: selectedRecipe.themeSeedColors,
      });

      await persistRecipe(user.uid, updatedRecipe);

      if (isPendingDraft) {
        clearPendingImportDraft(recipeId);
        const importedAt = recordRecipeViewedAt(updatedRecipe.id);
        upsertSavedRecipeInBrowseSessionCache(user.uid, updatedRecipe, { viewedAt: importedAt });
        setIsPendingDraft(false);
        router.replace(`/recipes/${recipeId}`, { scroll: false });
      }

      setCheckedIngredientIndices(nextCheckedIngredientIndices);
      setServingsOverride(null);
      if (localImagePreview?.startsWith("blob:")) {
        URL.revokeObjectURL(localImagePreview);
      }
      setLocalImagePreview(null);
      setIsEditingRecipe(false);
      setEditDraft(null);
    } catch (error) {
      console.error(error);
      setSaveEditError("We couldn’t save those recipe edits. Please try again.");
    } finally {
      setSavingEdit(false);
    }
  }

  function updateDraftRecipe(updater: (recipe: RecipeData) => RecipeData) {
    setEditDraft((current) => current ? { ...current, recipe: updater(current.recipe) } : current);
  }

  function updateDraftTags(tags: string[], systemTags?: string[]) {
    updateDraftRecipe((recipe) => ({
      ...recipe,
      tags: Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean))),
      systemTags: systemTags
        ? Array.from(new Set(systemTags.map((tag) => tag.trim()).filter(Boolean)))
        : recipe.systemTags,
    }));
  }

  function addDraftTag() {
    if (!editDraft) return;
    const trimmed = newTag.trim();
    const existingTags = new Set([...(editDraft.recipe.tags ?? []), ...(editDraft.recipe.systemTags ?? [])]);
    if (!trimmed || existingTags.has(trimmed)) return;
    updateDraftTags([...(editDraft.recipe.tags ?? []), trimmed]);
    setAllKnownTags((current) =>
      Array.from(new Set([...current, trimmed])).sort((left, right) => left.localeCompare(right)),
    );
    setNewTag("");
  }

  function chooseTagSuggestion(tag: string) {
    if (!editDraft) return;
    const existingTags = new Set([...(editDraft.recipe.tags ?? []), ...(editDraft.recipe.systemTags ?? [])]);
    if (existingTags.has(tag)) return;
    updateDraftTags([...(editDraft.recipe.tags ?? []), tag]);
    setNewTag("");
  }

  function removeDraftTag(tag: string) {
    if (!editDraft) return;
    updateDraftTags(
      (editDraft.recipe.tags ?? []).filter((candidate) => candidate !== tag),
      (editDraft.recipe.systemTags ?? []).filter((candidate) => candidate !== tag),
    );
  }

  function updateDraftIngredient(
    sectionId: string,
    ingredientId: string,
    updater: (ingredient: RecipeData["ingredientSections"][number]["ingredients"][number]) => RecipeData["ingredientSections"][number]["ingredients"][number],
  ) {
    updateDraftRecipe((recipe) => ({
      ...recipe,
      ingredientSections: recipe.ingredientSections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              ingredients: section.ingredients.map((ingredient) =>
                ingredient.id === ingredientId ? updater(ingredient) : ingredient,
              ),
            }
          : section,
      ),
    }));
  }

  function updateDraftInstruction(sectionId: string, instructionId: string, text: string) {
    updateDraftRecipe((recipe) =>
      renumberInstructions({
        ...recipe,
        instructionSections: recipe.instructionSections.map((section) =>
          section.id === sectionId
            ? {
                ...section,
                instructions: section.instructions.map((instruction) =>
                  instruction.id === instructionId ? { ...instruction, text } : instruction,
                ),
              }
            : section,
        ),
      }),
    );
  }

  function addDraftIngredient() {
    updateDraftRecipe((recipe) => {
      const sections = recipe.ingredientSections.length > 0
        ? recipe.ingredientSections
        : [{ id: makeId(), title: null, ingredients: [] }];
      const lastSectionIndex = sections.length - 1;
      return {
        ...recipe,
        ingredientSections: sections.map((section, index) =>
          index === lastSectionIndex
            ? { ...section, ingredients: [...section.ingredients, { id: makeId(), name: "" }] }
            : section,
        ),
      };
    });
  }

  function addDraftInstruction() {
    updateDraftRecipe((recipe) => {
      const sections = recipe.instructionSections.length > 0
        ? recipe.instructionSections
        : [{ id: makeId(), title: null, instructions: [] }];
      const lastSectionIndex = sections.length - 1;
      const nextStep = sections.reduce((total, section) => total + section.instructions.length, 0) + 1;
      return {
        ...recipe,
        instructionSections: sections.map((section, index) =>
          index === lastSectionIndex
            ? {
                ...section,
                instructions: [...section.instructions, { id: makeId(), stepNumber: nextStep, text: "" }],
              }
            : section,
        ),
      };
    });
  }

  function removeDraftIngredient(sectionId: string, ingredientId: string) {
    updateDraftRecipe((recipe) => ({
      ...recipe,
      ingredientSections: recipe.ingredientSections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              ingredients: section.ingredients.length > 1
                ? section.ingredients.filter((ingredient) => ingredient.id !== ingredientId)
                : section.ingredients.map((ingredient) =>
                    ingredient.id === ingredientId
                      ? { ...ingredient, amount: null, unit: null, name: "", notes: null }
                      : ingredient,
                  ),
            }
          : section,
      ),
    }));
  }

  function removeDraftInstruction(sectionId: string, instructionId: string) {
    updateDraftRecipe((recipe) =>
      renumberInstructions({
        ...recipe,
        instructionSections: recipe.instructionSections.map((section) =>
          section.id === sectionId
            ? {
                ...section,
                instructions: section.instructions.length > 1
                  ? section.instructions.filter((instruction) => instruction.id !== instructionId)
                  : section.instructions.map((instruction) =>
                      instruction.id === instructionId ? { ...instruction, text: "" } : instruction,
                    ),
              }
            : section,
        ),
      }),
    );
  }

  async function handleShareRecipe() {
    if (!selectedRecipe) return;

    const title = selectedRecipe.recipe.title?.trim() || "Recipe";
    setShareStatus(null);

    let shareId: string | null = null;

    try {
      const payload = buildShareLinkPayload(selectedRecipe.recipe, selectedRecipe.sourceURL);
      const shareLink = await createShareLink({
        recipeTitle: title,
        recipe: payload,
        sourceURL: selectedRecipe.sourceURL ?? null,
        imageURL: selectedRecipe.recipe.imageURL ?? null,
      });
      shareId = shareLink.shareId;
      const text = `Check out ${title} on CookPilot:\n${shareLink.shareURL}`;

      if (navigator.share) {
        await navigator.share({ title, text, url: shareLink.shareURL });
        return;
      }

      await navigator.clipboard.writeText(text);
      setShareStatus("Recipe link copied to clipboard.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        if (shareId) {
          await deleteShareLink(shareId);
        }
        return;
      }

      console.error(error);
      setShareStatus("We couldn’t share this recipe right now.");
    }
  }

  if (loadingRecipeDetail) {
    return showDetailSpinner ? (
      <div className="cp-page cp-page--centered">
        <LoadingSpinner label="Opening recipe" />
      </div>
    ) : null;
  }

  if (!selectedRecipe || !scaledRecipe) {
    return (
      <div className="cp-page cp-page--centered">
        <StateBlock
          message="That recipe is no longer available for this account."
          title="Recipe unavailable"
          tone="error"
        />
      </div>
    );
  }

  const hasDetailImage = Boolean(resolvedDetailImageSrc) && !detailImageFailed;
  const displayedRecipe = isEditingRecipe && editDraft ? editDraft.recipe : scaledRecipe;
  const baseRecipe = isEditingRecipe && editDraft ? editDraft.recipe : selectedRecipe.recipe;
  const aiEditSuggestions = defaultAIEditSuggestions(baseRecipe);
  const baseServings = baseRecipe.servings ?? 1;
  const currentServings = isEditingRecipe ? baseServings : servingsOverride ?? baseServings;
  const allScaledIngredients =
    displayedRecipe.ingredientSections.flatMap((section) => section.ingredients) ?? [];
  const measurementDominance = recipeIngredientMeasurementDominance(allScaledIngredients);
  const shouldShowConvertedMeasurements = showConvertedMeasurements(
    measurementMode,
    measurementDominance,
  );
  const canShowServingMultipliers =
    !isEditingRecipe && allScaledIngredients.length > 0 && baseServings > 0;
  const recipeTags = Array.from(new Set(orderedTags(baseRecipe)));
  const appliedTagSet = new Set(recipeTags);
  const filteredTagSuggestions = allKnownTags.filter(
    (tag) =>
      !appliedTagSet.has(tag) &&
      shouldOfferTagSuggestion(tag, baseRecipe.title) &&
      (!newTag.trim() || tag.toLowerCase().includes(newTag.trim().toLowerCase())),
  );
  const shouldOfferCreateTag =
    Boolean(newTag.trim()) &&
    !Array.from(appliedTagSet).some((tag) => tag.toLowerCase() === newTag.trim().toLowerCase());

  return (
    <div
      className={`cp-detail cp-detail--page${isEditingRecipe ? " cp-detail--editing" : ""}`.trim()}
      style={recipePalette ? ({
        "--recipe-bg": recipePalette.background,
        "--recipe-bg-dark": recipePalette.backgroundDark,
        "--recipe-chip-fill": recipePalette.chipFill,
        "--recipe-chip-text": recipePalette.chipText,
        "--recipe-accent": recipePalette.primaryAccent,
        "--recipe-chip-accent": recipePalette.chipAccent,
        "--recipe-chip-accent-on-bg": recipePalette.chipAccentOnBg,
        "--recipe-chip-accent-on-bg-dark": recipePalette.chipAccentOnBgDark,
        "--recipe-input-fill": recipePalette.inputFill,
        "--recipe-input-fill-dark": recipePalette.inputFillDark,
        "--recipe-on-primary": recipePalette.onPrimary,
      } as React.CSSProperties) : undefined}
    >
      <div className="cp-detail__topbar">
        <Button
          aria-label="Back to recipes"
          onClick={() => router.push("/recipes")}
          size="compact"
          variant="icon"
        >
          <ArrowLeft size={18} />
        </Button>
        <div className="cp-detail__topbar-actions">
          {isEditingRecipe ? (
            <>
              <Button onClick={handleCancelEdit} size="compact" variant="secondary">
                <X size={15} />
                Cancel
              </Button>
              <Button
                className="cp-button--save"
                disabled={savingEdit}
                onClick={() => void handleSaveManualEdit()}
                size="compact"
                variant="secondary"
              >
                {savingEdit ? <ArrowClockwise className="cp-spin" size={16} /> : <FloppyDisk size={16} />}
                Save
              </Button>
            </>
          ) : (
            <>
              <Button onClick={handleEditClick} size="compact" variant="secondary">
                <PencilSimple size={15} />
                Edit
              </Button>
              <Button onClick={() => void handleShareRecipe()} size="compact" variant="secondary">
                <ShareNetwork size={15} />
                Share
              </Button>
            </>
          )}
        </div>
      </div>

      <header className={`cp-detail__hero ${(isEditingRecipe || hasDetailImage) ? "" : "cp-detail__hero--text-only"}`.trim()}>
        <div className="cp-detail__hero-copy">
          {isEditingRecipe && editDraft ? (
            <div className="cp-inline-editor cp-inline-editor--hero">
              <TextField
                label="Name"
                onChange={(event) =>
                  updateDraftRecipe((recipe) => ({ ...recipe, title: event.target.value }))
                }
                placeholder="Chocolate chip cookies"
                value={editDraft.recipe.title ?? ""}
              />
              <div className="cp-inline-editor__meta-grid">
                <TimePickerField
                  label="Prep time"
                  value={editDraft.recipe.prepTime ?? null}
                  onChange={(val) => updateDraftRecipe((recipe) => ({ ...recipe, prepTime: val }))}
                />
                <TimePickerField
                  label="Cook time"
                  value={editDraft.recipe.cookTime ?? null}
                  onChange={(val) => updateDraftRecipe((recipe) => ({ ...recipe, cookTime: val }))}
                />
              </div>
              <TextField
                label="Link"
                onChange={(event) =>
                  setEditDraft((current) =>
                    current ? { ...current, sourceURL: event.target.value } : current,
                  )
                }
                placeholder="https://example.com/recipe"
                value={editDraft.sourceURL === "photo_upload" ? "" : (editDraft.sourceURL ?? "")}
              />
            </div>
          ) : (
            <>
              <h2>{selectedRecipe.recipe.title || "Untitled recipe"}</h2>

              {selectedRecipe.sourceURL && selectedRecipe.sourceURL !== "photo_upload" ? (
            <a
              className="cp-detail__source-link"
              href={selectedRecipe.sourceURL}
              rel="noreferrer"
              target="_blank"
            >
              View original recipe
              <ArrowUpRight size={13} weight="bold" />
            </a>
              ) : null}

              {(selectedRecipe.recipe.prepTime || selectedRecipe.recipe.cookTime) ? (
            <div className="cp-detail__tape-chips">
              {selectedRecipe.recipe.prepTime ? (
                <span className="cp-detail__tape-chip">
                  <Timer size={13} weight="bold" />
                  {selectedRecipe.recipe.prepTime} prep
                </span>
              ) : null}
              {selectedRecipe.recipe.cookTime ? (
                <span className="cp-detail__tape-chip">
                  <Fire size={13} weight="bold" />
                  {selectedRecipe.recipe.cookTime} cook
                </span>
              ) : null}
            </div>
              ) : null}

              {recipeTags.length > 0 ? (
            <div className="cp-detail__tags">
              {recipeTags.map((tag, index) => (
                <RecipeTagChip
                  isSystemTag={SYSTEM_TAGS.has(tag)}
                  key={tag}
                  tag={tag}
                  visualIndex={index}
                />
              ))}
            </div>
              ) : null}

              {shareStatus ? (
                <p className="cp-detail__share-status" role="status">
                  {shareStatus}
                </p>
              ) : null}
            </>
          )}
        </div>
        {isEditingRecipe && editDraft ? (
          <div className="cp-detail__hero-image cp-detail__hero-image--editable">
            <div className="cp-image-picker">
              <input
                ref={fileInputRef}
                accept="image/*"
                className="cp-image-picker__input"
                type="file"
                onChange={(e) => void handleImageChange(e)}
              />
              {(() => {
                const editImageSrc = localImagePreview ?? editDraft.recipe.imageURL;
                if (editImageSrc) {
                  return (
                    <div className="cp-image-picker__preview">
                      {/* Native img: Next/Image fill can hang loading Firebase URLs in edit mode */}
                      <img
                        alt={editDraft.recipe.title || "Recipe image"}
                        className="cp-image-picker__img"
                        key={editImageSrc}
                        onError={handleEditImagePreviewError}
                        src={editImageSrc}
                      />
                      {uploadingImage ? (
                        <div
                          className="cp-image-picker__uploading-overlay"
                          aria-busy="true"
                          aria-label="Uploading photo"
                        >
                          <LoadingSpinner label="Uploading photo" />
                        </div>
                      ) : null}
                      <button
                        aria-label="Remove photo"
                        className="cp-image-picker__remove"
                        disabled={uploadingImage}
                        onClick={handleRemoveImage}
                        type="button"
                      >
                        <X size={14} weight="bold" />
                      </button>
                      {status !== "anonymous" ? (
                        <button
                          className="cp-image-picker__change"
                          disabled={uploadingImage}
                          onClick={() => fileInputRef.current?.click()}
                          type="button"
                        >
                          Change photo
                        </button>
                      ) : null}
                    </div>
                  );
                }

                if (uploadingImage) {
                  return (
                    <div className="cp-image-picker__loading">
                      <LoadingSpinner label="Uploading photo" />
                    </div>
                  );
                }

                return null;
              })()}
              {!editDraft.recipe.imageURL && !localImagePreview && !uploadingImage ? (
                status === "anonymous" ? (
                <button className="cp-image-picker__add" disabled type="button">
                  <Plus size={28} />
                  <span>Sign in to add photos</span>
                </button>
              ) : (
                <button
                  className="cp-image-picker__add"
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  <Plus size={28} />
                  <span>Add photo</span>
                </button>
              )
              ) : null}
              {imageUploadError ? (
                <p className="cp-image-picker__error" role="alert">
                  {imageUploadError}
                </p>
              ) : null}
            </div>
          </div>
        ) : hasDetailImage ? (
          <div className="cp-detail__hero-image">
            <Image
              alt={selectedRecipe.recipe.title || "Recipe image"}
              className="cp-detail__image"
              height={300}
              onError={() => void handleDetailImageError()}
              src={resolvedDetailImageSrc!}
              unoptimized
              width={300}
            />
          </div>
        ) : null}
      </header>

      {saveEditError ? <StateBlock message={saveEditError} title="Save issue" tone="error" /> : null}

      {isEditingRecipe && editDraft ? (
        <section className="cp-detail__section-card cp-detail__section-card--tags">
          <SectionHeader title="Tags" />
          <div className="cp-detail__tags cp-detail__tags--editable">
            {recipeTags.map((tag, index) => (
              <RecipeTagChip
                isEditing
                isSystemTag={SYSTEM_TAGS.has(tag)}
                key={tag}
                onRemove={() => removeDraftTag(tag)}
                tag={tag}
                visualIndex={index}
              />
            ))}
          </div>
          <div className="cp-tag-editor">
            <input
              aria-label="New tag"
              className="cp-edit-row__input"
              onChange={(event) => setNewTag(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addDraftTag();
                }
              }}
              placeholder="Add a tag"
              value={newTag}
            />
            <Button disabled={!newTag.trim()} onClick={addDraftTag} size="compact" variant="secondary">
              <Plus size={15} />
              Add tag
            </Button>
          </div>
          {(shouldOfferCreateTag || filteredTagSuggestions.length > 0) ? (
            <div className="cp-tag-suggestions" aria-label="Tag options">
              {shouldOfferCreateTag ? (
                <button
                  className="cp-tag-suggestion cp-tag-suggestion--create"
                  onClick={addDraftTag}
                  type="button"
                >
                  <Plus size={13} weight="bold" />
                  Create “{newTag.trim()}”
                </button>
              ) : null}
              {filteredTagSuggestions.map((tag) => (
                <button
                  className="cp-tag-suggestion"
                  key={tag}
                  onClick={() => chooseTagSuggestion(tag)}
                  type="button"
                >
                  <TagIconGlyph tag={tag} size={13} />
                  {tag}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="cp-detail__grid">
        <DetailSection
          bare={isEditingRecipe}
          title="Ingredients"
          titleAddon={<span className="cp-section-header__count">{allScaledIngredients.length}</span>}
          titleBelow={
            <IngredientMeasurementDropdown
              measurementMenuRef={measurementMenuRef}
              measurementMode={measurementMode}
              onSelectMeasurementMode={(mode) => {
                setMeasurementMode(mode);
                setShowMeasurementMenu(false);
                setSelectedRecipe((current) =>
                  current
                    ? {
                        ...current,
                        preferredIngredientMeasurementRaw:
                          mode === "original" ? null : mode,
                      }
                    : current,
                );
                void persistIngredientPreferences({
                  preferredIngredientMeasurementRaw: mode === "original" ? null : mode,
                });
              }}
              onToggleMeasurementMenu={() => setShowMeasurementMenu((current) => !current)}
              showMeasurementMenu={showMeasurementMenu}
            />
          }
          action={
            <div className="cp-ingredients-header__servings-column">
              <IngredientsServingsControl
                currentServings={currentServings}
                onDecrement={() => {
                  const nextServings = Math.max(1, currentServings - 1);
                  if (isEditingRecipe) {
                    updateDraftRecipe((recipe) => ({ ...recipe, servings: nextServings }));
                  } else {
                    setServingsOverride(nextServings);
                  }
                }}
                onIncrement={() => {
                  const nextServings = currentServings + 1;
                  if (isEditingRecipe) {
                    updateDraftRecipe((recipe) => ({ ...recipe, servings: nextServings }));
                  } else {
                    setServingsOverride(nextServings);
                  }
                }}
                onServingsInput={(value) => {
                  const next = parseServingsInput(value);
                  if (next === null) return;
                  if (isEditingRecipe) {
                    updateDraftRecipe((recipe) => ({ ...recipe, servings: next }));
                  } else {
                    setServingsOverride(next);
                  }
                }}
              />
              {canShowServingMultipliers ? (
                <ServingsMultiplierPills
                  baseServings={baseServings}
                  currentServings={currentServings}
                  onSelectServings={setServingsOverride}
                />
              ) : null}
            </div>
          }
        >
          {displayedRecipe.ingredientSections.map((section, sectionOffset) => {
            const priorIngredients = displayedRecipe.ingredientSections
              .slice(0, sectionOffset)
              .reduce((count, candidate) => count + candidate.ingredients.length, 0);
            return (
            <div className="cp-detail__section-block" key={section.id}>
              {section.title ? <h4 className="cp-detail__section-title">{section.title}</h4> : null}
              <ul className="cp-ingredient-list cp-ingredient-list--checkable">
                {section.ingredients.map((ingredient, sectionIndex) => {
                  const globalIndex = priorIngredients + sectionIndex;
                  const isChecked = checkedIngredientIndices.includes(globalIndex);

                  return (
                    <li key={ingredient.id}>
                      {isEditingRecipe && editDraft ? (
                        <div className="cp-edit-row cp-edit-row--ingredient">
                          <input
                            aria-label={`Ingredient ${globalIndex + 1} amount`}
                            className="cp-edit-row__input cp-edit-row__input--amount"
                            onChange={(event) =>
                              updateDraftIngredient(section.id, ingredient.id, (current) => ({
                                ...current,
                                amount: event.target.value,
                              }))
                            }
                            placeholder="Amount"
                            value={ingredient.amount ?? ""}
                          />
                          <input
                            aria-label={`Ingredient ${globalIndex + 1} unit`}
                            className="cp-edit-row__input cp-edit-row__input--unit"
                            onChange={(event) =>
                              updateDraftIngredient(section.id, ingredient.id, (current) => ({
                                ...current,
                                unit: event.target.value,
                              }))
                            }
                            placeholder="Unit"
                            value={ingredient.unit ?? ""}
                          />
                          <input
                            aria-label={`Ingredient ${globalIndex + 1} name`}
                            className="cp-edit-row__input"
                            onChange={(event) =>
                              updateDraftIngredient(section.id, ingredient.id, (current) => ({
                                ...current,
                                name: event.target.value,
                              }))
                            }
                            placeholder="Ingredient"
                            value={ingredient.name}
                          />
                          <input
                            aria-label={`Ingredient ${globalIndex + 1} notes`}
                            className="cp-edit-row__input"
                            onChange={(event) =>
                              updateDraftIngredient(section.id, ingredient.id, (current) => ({
                                ...current,
                                notes: event.target.value,
                              }))
                            }
                            placeholder="Notes"
                            value={ingredient.notes ?? ""}
                          />
                          <button
                            aria-label={`Delete ingredient ${globalIndex + 1}`}
                            className="cp-edit-row__delete"
                            onClick={() => removeDraftIngredient(section.id, ingredient.id)}
                            type="button"
                          >
                            <Trash size={16} />
                          </button>
                        </div>
                      ) : (
                        <button
                        className={`cp-ingredient-row ${isChecked ? "is-checked" : ""}`.trim()}
                        onClick={() => {
                          const next = isChecked
                            ? checkedIngredientIndices.filter((value) => value !== globalIndex)
                            : [...checkedIngredientIndices, globalIndex].sort((a, b) => a - b);
                          setCheckedIngredientIndices(next);
                          setSelectedRecipe((current) =>
                            current
                              ? {
                                  ...current,
                                  checkedIngredientIndices: next,
                                }
                              : current,
                          );
                          void persistIngredientPreferences({ checkedIngredientIndices: next });
                        }}
                        type="button"
                      >
                        <span className="cp-ingredient-row__check" aria-hidden="true">
                          <svg className="cp-ingredient-check-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle className="cp-ingredient-check-svg__circle" cx="12" cy="12" r="10.325" />
                            {/* Glow/shadow layer — mirrors iOS overlay stroke at opacity 0.28, offset (0.15, 0.18) */}
                            <path className="cp-ingredient-check-svg__mark-glow" d="M 5.03,12.918 C 6.614,14.304 8.594,17.472 10.178,18.066 C 12.95,13.314 20.078,4.998 24.434,3.018" />
                            {/* Primary mark */}
                            <path className="cp-ingredient-check-svg__mark" d="M 4.88,12.738 C 6.464,14.124 8.444,17.292 10.028,17.886 C 12.8,13.134 19.928,4.818 24.284,2.838" />
                          </svg>
                        </span>
                        <span className="cp-ingredient-row__text">
                          {displayIngredient(
                            ingredient,
                            measurementDominance,
                            shouldShowConvertedMeasurements,
                          )}
                        </span>
                      </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
            );
          })}
          {isEditingRecipe ? (
            <Button onClick={addDraftIngredient} size="compact" variant="secondary">
              <Plus size={15} />
              Add ingredient
            </Button>
          ) : null}
        </DetailSection>

        <DetailSection bare={isEditingRecipe} title="Instructions">
          {displayedRecipe.instructionSections.map((section) => (
            <div className="cp-detail__section-block" key={section.id}>
              {section.title ? <h4 className="cp-detail__section-title">{section.title}</h4> : null}
              <ol className="cp-instruction-list">
                {section.instructions.map((instruction) => (
                  <li key={instruction.id}>
                    <span className="cp-instruction-list__step">{instruction.stepNumber}</span>
                    {isEditingRecipe ? (
                      <div className="cp-edit-row cp-edit-row--instruction">
                        <textarea
                          aria-label={`Step ${instruction.stepNumber}`}
                          className="cp-edit-row__input cp-edit-row__textarea"
                          onChange={(event) =>
                            updateDraftInstruction(section.id, instruction.id, event.target.value)
                          }
                          placeholder="Describe this step"
                          rows={3}
                          value={instruction.text}
                        />
                        <button
                          aria-label={`Delete step ${instruction.stepNumber}`}
                          className="cp-edit-row__delete"
                          onClick={() => removeDraftInstruction(section.id, instruction.id)}
                          type="button"
                        >
                          <Trash size={16} />
                        </button>
                      </div>
                    ) : (
                      <p>{instruction.text}</p>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          ))}
          {isEditingRecipe ? (
            <Button onClick={addDraftInstruction} size="compact" variant="secondary">
              <Plus size={15} />
              Add step
            </Button>
          ) : null}
        </DetailSection>
      </div>

      {isEditingRecipe ? (
        <AIEditSection
          editState={editState}
          onApplyPrompt={(prompt) => void handleEditRecipe(prompt)}
          onPromptChange={(prompt) => setEditState((current) => ({ ...current, prompt }))}
          suggestions={aiEditSuggestions}
        />
      ) : null}

      {isEditingRecipe && !isPendingDraft ? (
        <section className="cp-detail__section-card cp-detail__section-card--danger">
          {deleteError ? <StateBlock message={deleteError} title="Delete issue" tone="error" /> : null}
          {showDeleteConfirm ? (
            <div className="cp-delete-confirm">
              <p className="cp-delete-confirm__message">
                This will permanently delete this recipe. There&rsquo;s no undo.
              </p>
              <div className="cp-delete-confirm__actions">
                <Button
                  disabled={deletingRecipe}
                  onClick={() => setShowDeleteConfirm(false)}
                  size="compact"
                  variant="secondary"
                >
                  Cancel
                </Button>
                <Button
                  className="cp-button--danger"
                  disabled={deletingRecipe}
                  onClick={() => void handleDeleteRecipe()}
                  size="compact"
                >
                  {deletingRecipe ? <ArrowClockwise className="cp-spin" size={16} /> : <Trash size={16} />}
                  Delete recipe
                </Button>
              </div>
            </div>
          ) : (
            <Button
              className="cp-button--danger"
              onClick={() => setShowDeleteConfirm(true)}
              size="compact"
              variant="secondary"
            >
              <Trash size={16} />
              Delete recipe
            </Button>
          )}
        </section>
      ) : null}
    </div>
  );
}
