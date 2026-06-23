"use client";

import {
  CaretDown,
  CaretLeft,
  CaretRight,
  FunnelSimple,
  MagnifyingGlass,
  Plus,
  SortAscending,
  X,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import {
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  knownTagsFromRecipes,
  recipeMatchesSearch,
  recipeMatchesTags,
  RECIPE_SORT_OPTIONS,
  sortRecipes,
  type RecipeSortOption,
} from "@/lib/cookpilot/recipeBrowse";
import {
  createInitialLastViewedTimestamps,
  getRecipesBrowseSessionCache,
  saveRecipesBrowseSessionCache,
} from "@/lib/cookpilot/recipesBrowseSessionCache";
import { AuthDialog } from "@/components/cookpilot/AuthDialog";
import { useAuth } from "@/components/providers/AuthProvider";
import { ImportRecipePanel } from "@/components/cookpilot/ImportPage";
import { IMPORT_DRAFT_SEARCH_PARAM } from "@/lib/cookpilot/importDraft";
import { SettingsPanel } from "@/components/cookpilot/SettingsPage";
import { RecipeCard } from "@/components/ui/RecipeCard";
import { TagIconGlyph } from "@/components/ui/TagIconGlyph";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { StateBlock } from "@/components/ui/StateBlock";
import { loadAllRecipeTags, loadRecipePage } from "@/lib/cookpilot/firestore";
import { ModalShell } from "@/components/cookpilot/ModalShell";
import { recordRecipeViewedAt } from "@/lib/cookpilot/recentlyViewed";
import { consumeRecipeDeletedToast } from "@/lib/cookpilot/recipeDeletedToast";
import type { RecipePageCursor, RecipeSummary } from "@/lib/cookpilot/types";

const BROWSE_STATE_STORAGE_KEY = "cookpilot.recipeBrowseState";
const MAX_ANONYMOUS_RECIPES = 5;

// Mirror iOS buildColumns column-count logic.
// Shell has 24 px padding each side; card minimum 220 px; gap 22 px.
// Results: 2 at ≤480 px, 3 at 768 px, 4 at 1024 px, 5 at 1280–1440 px, 6 max.
function calcRecipeColumnCount(): number {
  if (typeof window === "undefined") return 3;
  const SHELL_PADDING = 48;
  const CARD_MIN = 220;
  const GAP = 22;
  const gridWidth = window.innerWidth - SHELL_PADDING;
  return Math.min(6, Math.max(2, Math.floor((gridWidth + GAP) / (CARD_MIN + GAP))));
}

type StoredBrowseState = {
  searchQuery?: string;
  sortOption?: RecipeSortOption;
  activeTagFilters?: string[];
  scrollY?: number;
};

function loadStoredBrowseState(): StoredBrowseState {
  if (typeof window === "undefined") return {};

  try {
    const rawState = window.sessionStorage.getItem(BROWSE_STATE_STORAGE_KEY);
    if (!rawState) return {};

    const parsed = JSON.parse(rawState) as StoredBrowseState;
    const sortOption = RECIPE_SORT_OPTIONS.some((option) => option.value === parsed.sortOption)
      ? parsed.sortOption
      : undefined;

    return {
      searchQuery: typeof parsed.searchQuery === "string" ? parsed.searchQuery : undefined,
      sortOption,
      activeTagFilters: Array.isArray(parsed.activeTagFilters)
        ? parsed.activeTagFilters.filter((tag): tag is string => typeof tag === "string")
        : undefined,
      scrollY:
        typeof parsed.scrollY === "number" && Number.isFinite(parsed.scrollY)
          ? Math.max(0, parsed.scrollY)
          : undefined,
    };
  } catch {
    return {};
  }
}

function saveStoredBrowseState(update: StoredBrowseState) {
  if (typeof window === "undefined") return;

  const nextState: StoredBrowseState = {
    ...loadStoredBrowseState(),
    ...update,
  };

  window.sessionStorage.setItem(BROWSE_STATE_STORAGE_KEY, JSON.stringify(nextState));
}

function EmptyRecipeState({ onImport }: { onImport: () => void }) {
  return (
    <div className="cp-empty-state">
      <div className="cp-recipe-card cp-empty-state__card">
        <span aria-hidden="true" className="cp-recipe-card__tape cp-recipe-card__tape--2" />
        <div className="cp-empty-state__copy">
          <h2>Import your first recipe</h2>
          <p>Paste any recipe link and we&apos;ll turn it into an editable recipe.</p>
        </div>
        <Button className="cp-empty-state__button" onClick={onImport}>
          <Plus size={20} />
          New recipe
        </Button>
        <p className="cp-empty-state__meta">Swap ingredients • Refine recipes • Make it yours</p>
      </div>
    </div>
  );
}

function RecipeDeletedToast() {
  return (
    <div className="cp-board-toast" role="status" aria-live="polite">
      Recipe deleted
    </div>
  );
}

function readSessionCacheForUser(userId: string | undefined) {
  if (!userId) return null;
  return getRecipesBrowseSessionCache(userId);
}

export function RecipesPage({
  initialDialog = null,
}: {
  initialDialog?: "import" | "settings" | null;
}) {
  const router = useRouter();
  const { status, user } = useAuth();
  const [initialStoredBrowseState] = useState(() => loadStoredBrowseState());
  const initialSessionCache = readSessionCacheForUser(user?.uid);
  const restoredFromSessionRef = useRef(Boolean(initialSessionCache));
  const pendingScrollRestoreRef = useRef(true);
  const [recipes, setRecipes] = useState<RecipeSummary[]>(
    () => initialSessionCache?.recipes ?? [],
  );
  const [allKnownTags, setAllKnownTags] = useState<string[]>(
    () => knownTagsFromRecipes(initialSessionCache?.recipes ?? []),
  );
  const [loadingRecipes, setLoadingRecipes] = useState(
    () => !initialSessionCache,
  );
  const [showGridSpinner, setShowGridSpinner] = useState(false);
  const [recipesError, setRecipesError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<RecipePageCursor | null>(
    () => initialSessionCache?.nextCursor ?? null,
  );
  const [totalRecipeCount, setTotalRecipeCount] = useState(
    () => initialSessionCache?.totalRecipeCount ?? 0,
  );
  const [searchQuery, setSearchQuery] = useState(
    () => initialStoredBrowseState.searchQuery ?? "",
  );
  const [sortOption, setSortOption] = useState<RecipeSortOption>(
    () => initialStoredBrowseState.sortOption ?? "createdDate",
  );
  // Read inside the fetch effect (which only depends on status/user) so the
  // initial load knows the active sort without re-running on every sort change.
  const sortOptionRef = useRef(sortOption);
  sortOptionRef.current = sortOption;
  const [activeTagFilters, setActiveTagFilters] = useState<Set<string>>(
    () => new Set(initialStoredBrowseState.activeTagFilters ?? []),
  );
  const [tagScrollEdges, setTagScrollEdges] = useState({
    canScrollLeft: false,
    canScrollRight: false,
  });
  const [isImportOpen, setIsImportOpen] = useState(initialDialog === "import");
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(initialDialog === "settings");
  const [isMobileFilterDrawerOpen, setIsMobileFilterDrawerOpen] = useState(false);
  const [lastViewedTimestamps] = useState<Record<string, number>>(
    () =>
      initialSessionCache?.lastViewedTimestamps ?? createInitialLastViewedTimestamps(),
  );
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMoreInFlightCursorRef = useRef<string | null>(null);
  const stickyControlsSentinelRef = useRef<HTMLDivElement | null>(null);
  const tagScrollerRef = useRef<HTMLDivElement | null>(null);
  const [columnCount, setColumnCount] = useState(() => calcRecipeColumnCount());
  const [isStickyControlsStuck, setIsStickyControlsStuck] = useState(false);
  const [showRecipeDeletedToast, setShowRecipeDeletedToast] = useState(false);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const userIdForTags = user?.uid;
  const anonymousRecipeCount = Math.max(totalRecipeCount, recipes.length);
  const importRequiresAuth =
    status === "anonymous" && anonymousRecipeCount >= MAX_ANONYMOUS_RECIPES;
  const loadMoreCursorKey = nextCursor
    ? `${nextCursor.createdAt.toISOString()}:${nextCursor.id}`
    : null;

  function openImportDialog() {
    if (importRequiresAuth) {
      setIsAuthOpen(true);
      return;
    }

    setIsImportOpen(true);
  }

  function closeImportDialog() {
    setIsImportOpen(false);
    if (initialDialog === "import") {
      router.replace("/recipes", { scroll: false });
    }
  }

  function closeSettingsDialog() {
    setIsSettingsOpen(false);
    if (initialDialog === "settings") {
      router.replace("/recipes", { scroll: false });
    }
  }

  useEffect(() => {
    const shouldDelaySpinner = loadingRecipes && recipes.length === 0;
    const t = setTimeout(
      () => setShowGridSpinner(shouldDelaySpinner),
      shouldDelaySpinner ? 200 : 0,
    );
    return () => clearTimeout(t);
  }, [loadingRecipes, recipes.length]);

  useEffect(() => {
    if (!consumeRecipeDeletedToast()) return;
    const showTimeout = window.setTimeout(() => {
      setShowRecipeDeletedToast(true);
    }, 0);
    const hideTimeout = window.setTimeout(() => {
      setShowRecipeDeletedToast(false);
    }, 3600);
    return () => {
      window.clearTimeout(showTimeout);
      window.clearTimeout(hideTimeout);
    };
  }, []);

  useEffect(() => {
    saveStoredBrowseState({
      searchQuery,
      sortOption,
      activeTagFilters: Array.from(activeTagFilters),
    });
  }, [activeTagFilters, searchQuery, sortOption]);

  useLayoutEffect(() => {
    if (!pendingScrollRestoreRef.current || loadingRecipes || recipes.length === 0) return;

    const cached = user ? getRecipesBrowseSessionCache(user.uid) : null;
    const scrollY =
      (restoredFromSessionRef.current ? cached?.scrollY : undefined) ??
      initialStoredBrowseState.scrollY;

    pendingScrollRestoreRef.current = false;
    if (!scrollY) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollY, behavior: "auto" });
      });
    });
  }, [initialStoredBrowseState.scrollY, loadingRecipes, recipes.length, user]);

  // Keep column count in sync with the viewport width.
  // Uses window.innerWidth (always available) so it doesn't depend on the grid
  // div being mounted — which it isn't during the initial loading state.
  useEffect(() => {
    function update() { setColumnCount(calcRecipeColumnCount()); }
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const sentinel = stickyControlsSentinelRef.current;
    if (!sentinel) return;
    const observedSentinel = sentinel;

    function updateStickyState() {
      setIsStickyControlsStuck(observedSentinel.getBoundingClientRect().bottom <= 0);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsStickyControlsStuck(!entry.isIntersecting);
      },
      { threshold: 0 },
    );

    observer.observe(observedSentinel);
    updateStickyState();
    window.addEventListener("scroll", updateStickyState, { passive: true });
    window.addEventListener("resize", updateStickyState, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", updateStickyState);
      window.removeEventListener("resize", updateStickyState);
    };
  }, []);

  useEffect(() => {
    if (status === "signedOut") {
      setRecipes([]);
      setAllKnownTags([]);
      setNextCursor(null);
      setTotalRecipeCount(0);
      setLoadingRecipes(false);
      setRecipesError(null);
      return;
    }

    // Skip while auth is still settling (e.g. mid sign-out while anonymous
    // user is being created). status === "loading" means user will change again
    // shortly — fetching now would cause a stale/error flash.
    if (!user || status === "loading") return;
    const userId = user.uid;
    const hasCachedPage = Boolean(getRecipesBrowseSessionCache(userId));
    let cancelled = false;

    async function fetchFirstPage() {
      if (!hasCachedPage) {
        setLoadingRecipes(true);
      }
      setRecipesError(null);

      try {
        const page = await loadRecipePage(userId, null, undefined, true);
        if (cancelled) return;

        if (hasCachedPage) {
          // Silent background refresh: merge updates into the existing list so that
          // (a) newly added recipes appear, (b) stale summaries get updated, and
          // (c) recipes loaded via pagination are NOT replaced by just the first page.
          setRecipes((current) => {
            const freshById = new Map(page.recipes.map((r) => [r.id, r]));
            const currentIds = new Set(current.map((r) => r.id));
            const brandNew = page.recipes.filter((r) => !currentIds.has(r.id));
            const updated = current.map((r) => freshById.get(r.id) ?? r);
            return [...brandNew, ...updated];
          });
          // Don’t update nextCursor — the user may have already paginated past page 1.
          if (page.totalCount !== null) {
            setTotalRecipeCount(page.totalCount);
          }
        } else {
          // Server pagination is ordered by createdAt desc, but the grid
          // re-sorts client-side. For "Date added" that order already matches,
          // so reveal page 1 immediately. For other sorts, revealing page 1 and
          // then streaming in later pages makes the list visibly reshuffle — so
          // load the full set first and reveal once the sorted order is stable.
          let accumulated = page.recipes;
          let cursor = page.nextCursor;

          if (sortOptionRef.current !== "createdDate") {
            while (cursor) {
              const nextPage = await loadRecipePage(userId, cursor);
              if (cancelled) return;
              const seen = new Set(accumulated.map((recipe) => recipe.id));
              accumulated = [
                ...accumulated,
                ...nextPage.recipes.filter((recipe) => !seen.has(recipe.id)),
              ];
              cursor = nextPage.nextCursor;
            }
          }

          setRecipes(accumulated);
          setNextCursor(cursor);
          setTotalRecipeCount(page.totalCount ?? accumulated.length);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setRecipesError("Couldn’t load your recipes.");
        }
      } finally {
        if (!cancelled) {
          setLoadingRecipes(false);
        }
      }
    }

    void fetchFirstPage();

    return () => {
      cancelled = true;
    };
  }, [status, user]);

  useEffect(() => {
    const loadedTags = knownTagsFromRecipes(recipes);
    if (loadedTags.length === 0) return;

    setAllKnownTags((current) =>
      Array.from(new Set([...current, ...loadedTags])).sort((a, b) => a.localeCompare(b)),
    );
  }, [recipes]);

  useEffect(() => {
    if (!userIdForTags || status === "loading" || status === "signedOut") return;
    let cancelled = false;

    void loadAllRecipeTags(userIdForTags)
      .then((tags) => {
        if (!cancelled) {
          setAllKnownTags(tags);
        }
      })
      .catch((error) => {
        console.error(error);
      });

    return () => {
      cancelled = true;
    };
  }, [status, userIdForTags]);

  useEffect(() => {
    if (!user || recipes.length === 0) return;
    const userId = user.uid;

    function persistCurrentScrollPosition() {
      saveStoredBrowseState({ scrollY: window.scrollY });
      saveRecipesBrowseSessionCache({
        userId,
        recipes,
        nextCursor,
        totalRecipeCount,
        lastViewedTimestamps,
        scrollY: window.scrollY,
      });
    }

    window.addEventListener("pagehide", persistCurrentScrollPosition);

    return () => {
      window.removeEventListener("pagehide", persistCurrentScrollPosition);
      persistCurrentScrollPosition();
    };
  }, [user, recipes, nextCursor, totalRecipeCount, lastViewedTimestamps]);

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || !user || !nextCursor || loadingRecipes) return;
    const userId = user.uid;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (loadMoreInFlightCursorRef.current === loadMoreCursorKey) return;

        void (async () => {
          loadMoreInFlightCursorRef.current = loadMoreCursorKey;
          setLoadingRecipes(true);
          try {
            const page = await loadRecipePage(userId, nextCursor);
            setRecipes((current) => {
              const currentIds = new Set(current.map((recipe) => recipe.id));
              const newRecipes = page.recipes.filter((recipe) => !currentIds.has(recipe.id));
              return [...current, ...newRecipes];
            });
            setNextCursor(page.nextCursor);
          } catch (error) {
            console.error(error);
            setRecipesError("Couldn’t load more recipes.");
          } finally {
            loadMoreInFlightCursorRef.current = null;
            setLoadingRecipes(false);
          }
        })();
      },
      {
        rootMargin: "0px 0px 900px 0px",
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMoreCursorKey, loadingRecipes, nextCursor, user]);

  useLayoutEffect(() => {
    const scroller = tagScrollerRef.current;
    if (!scroller) {
      setTagScrollEdges({ canScrollLeft: false, canScrollRight: false });
      return;
    }
    const tagScroller = scroller;
    const scrollEdgeThreshold = 4;

    function updateScrollEdges() {
      const maxScrollLeft = tagScroller.scrollWidth - tagScroller.clientWidth;
      setTagScrollEdges({
        canScrollLeft: tagScroller.scrollLeft > scrollEdgeThreshold,
        canScrollRight: tagScroller.scrollLeft < maxScrollLeft - scrollEdgeThreshold,
      });
    }

    updateScrollEdges();
    tagScroller.addEventListener("scroll", updateScrollEdges, { passive: true });
    window.addEventListener("resize", updateScrollEdges);
    const resizeObserver = new ResizeObserver(updateScrollEdges);
    resizeObserver.observe(tagScroller);

    return () => {
      tagScroller.removeEventListener("scroll", updateScrollEdges);
      window.removeEventListener("resize", updateScrollEdges);
      resizeObserver.disconnect();
    };
  }, [allKnownTags.length]);

  const visibleRecipes = useMemo(() => {
    const filteredRecipes = recipes.filter(
      (recipe) =>
        recipeMatchesTags(recipe, activeTagFilters) &&
        recipeMatchesSearch(recipe, deferredSearchQuery),
    );

    return sortRecipes(filteredRecipes, sortOption, lastViewedTimestamps);
  }, [activeTagFilters, deferredSearchQuery, lastViewedTimestamps, recipes, sortOption]);

  // Round-robin distribution into columns — mirrors iOS buildColumns(offset % count).
  // This gives left→right reading order that matches the sort: recipe[0] → col[0],
  // recipe[1] → col[1], recipe[2] → col[2], recipe[3] → col[0], …
  const recipeColumns = useMemo<RecipeSummary[][]>(() => {
    const cols: RecipeSummary[][] = Array.from({ length: columnCount }, () => []);
    visibleRecipes.forEach((recipe, i) => {
      cols[i % columnCount].push(recipe);
    });
    return cols;
  }, [visibleRecipes, columnCount]);

  function toggleTagFilter(tag: string) {
    setActiveTagFilters((current) => {
      const next = new Set(current);

      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }

      return next;
    });
  }

  function clearTagFilters() {
    setActiveTagFilters(new Set());
  }

  function markRecipeOpened(recipeId: string) {
    saveStoredBrowseState({ scrollY: window.scrollY });
    recordRecipeViewedAt(recipeId);
  }

  function scrollTagFilters(direction: "left" | "right") {
    tagScrollerRef.current?.scrollBy({
      left: direction === "right" ? 260 : -260,
      behavior: "smooth",
    });
  }

  // Auth is mid-transition (e.g. signing out, anonymous user being created).
  // Show nothing — the next status update will render the right state cleanly.
  if (status === "loading") {
    return null;
  }

  if (loadingRecipes && recipes.length === 0) {
    return showGridSpinner ? (
      <div className="cp-page cp-page--centered">
        <LoadingSpinner label="Loading recipes" />
      </div>
    ) : null;
  }

  if (!loadingRecipes && recipes.length === 0) {
    return (
      <div className="cp-detail cp-detail--empty">
        <EmptyRecipeState onImport={openImportDialog} />
        {showRecipeDeletedToast ? <RecipeDeletedToast /> : null}
        {isImportOpen && !importRequiresAuth ? (
          <ImportRecipeDialog
            onClose={closeImportDialog}
            onComplete={(recipeId) => {
              setIsImportOpen(false);
              router.push(`/recipes/${recipeId}?${IMPORT_DRAFT_SEARCH_PARAM}=1`);
            }}
          />
        ) : null}
        {isAuthOpen || (isImportOpen && importRequiresAuth) ? (
          <AuthDialog
            onClose={() => {
              setIsAuthOpen(false);
              if (isImportOpen) {
                closeImportDialog();
              }
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="cp-board">
      <div aria-hidden="true" className="cp-board__sticky-sentinel" ref={stickyControlsSentinelRef} />
      <div className={`cp-board__sticky-controls ${isStickyControlsStuck ? "is-stuck" : ""}`.trim()}>
        <header className="cp-board__header cp-board__header--browse">
          <div className="cp-board__title-row">
            <div className="cp-board__title">
              <h1>Recipes</h1>
              <span>{totalRecipeCount}</span>
            </div>
            <Button className="cp-board__new-recipe" onClick={openImportDialog}>
              <Plus size={18} />
              <span className="cp-board__new-recipe-label cp-board__new-recipe-label--full">
                New recipe
              </span>
              <span className="cp-board__new-recipe-label cp-board__new-recipe-label--short">New</span>
            </Button>
          </div>
        </header>

        <div className="cp-board__controls">
          <div className="cp-board__search-row">
            <div className="cp-searchbar">
              <MagnifyingGlass size={18} />
              <input
                aria-label="Search recipes"
                id="recipes-search"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by name or ingredient..."
                type="text"
                value={searchQuery}
              />
              {searchQuery ? (
                <button
                  aria-label="Clear recipe search"
                  className="cp-searchbar__clear"
                  onClick={() => setSearchQuery("")}
                  type="button"
                >
                  <X size={14} weight="bold" />
                </button>
              ) : null}
            </div>

            <button
              aria-label={
                activeTagFilters.size > 0
                  ? `Open sort and filters, ${activeTagFilters.size} active`
                  : "Open sort and filters"
              }
              className="cp-mobile-filter-button"
              onClick={() => setIsMobileFilterDrawerOpen(true)}
              type="button"
            >
              <FunnelSimple size={18} weight="bold" />
              {activeTagFilters.size > 0 ? (
                <span className="cp-mobile-filter-button__badge">{activeTagFilters.size}</span>
              ) : null}
            </button>

            <div className="cp-board__browse-actions">
              <label className="cp-sort-select">
                <div className="cp-sort-select__control">
                  <SortAscending className="cp-sort-select__icon" size={16} weight="bold" />
                  <select
                    aria-label="Sort recipes"
                    onChange={(event) => setSortOption(event.target.value as RecipeSortOption)}
                    value={sortOption}
                  >
                    {RECIPE_SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <CaretDown className="cp-sort-select__caret" size={14} weight="bold" />
                </div>
              </label>

              {allKnownTags.length > 0 ? (
                <div
                  className={[
                    "cp-filter-strip",
                    tagScrollEdges.canScrollLeft ? "cp-filter-strip--scroll-left" : "",
                    tagScrollEdges.canScrollRight ? "cp-filter-strip--scroll-right" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {tagScrollEdges.canScrollLeft ? (
                    <button
                      aria-label="Scroll tag filters left"
                      className="cp-filter-strip__arrow cp-filter-strip__arrow--left"
                      onClick={() => scrollTagFilters("left")}
                      type="button"
                    >
                      <CaretLeft size={18} weight="bold" />
                    </button>
                  ) : null}
                  <div
                    aria-label="Filter by tag"
                    className="cp-filter-strip__scroller"
                    ref={tagScrollerRef}
                    role="group"
                  >
                    {allKnownTags.map((tag) => {
                      const isActive = activeTagFilters.has(tag);

                      return (
                        <button
                          aria-pressed={isActive}
                          className={`cp-filter-tag ${isActive ? "is-active" : ""}`.trim()}
                          key={tag}
                          onClick={() => toggleTagFilter(tag)}
                          type="button"
                        >
                          <TagIconGlyph tag={tag} />
                          <span>{tag}</span>
                          {isActive ? (
                            <X
                              aria-hidden="true"
                              className="cp-filter-tag__remove"
                              size={13}
                              weight="bold"
                            />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  {tagScrollEdges.canScrollRight ? (
                    <button
                      aria-label="Scroll tag filters right"
                      className="cp-filter-strip__arrow cp-filter-strip__arrow--right"
                      onClick={() => scrollTagFilters("right")}
                      type="button"
                    >
                      <CaretRight size={18} weight="bold" />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {recipesError ? (
        <StateBlock message={recipesError} title="Library issue" tone="error" />
      ) : null}

      {!loadingRecipes && recipes.length > 0 && visibleRecipes.length === 0 ? (
        <div className="cp-board__status">
          <StateBlock
            message="Try clearing filters or searching with a broader term."
            title="No matching recipes"
          />
        </div>
      ) : null}

      <div className="cp-recipe-grid">
        {recipeColumns.map((col, colIdx) => (
          <div className="cp-recipe-column" key={colIdx}>
            {col.map((recipe) => (
              <RecipeCard
                href={`/recipes/${recipe.id}`}
                isSelected={false}
                key={recipe.id}
                onOpen={() => markRecipeOpened(recipe.id)}
                recipe={recipe}
              />
            ))}
          </div>
        ))}
      </div>

      {loadingRecipes ? (
        <div className="cp-board__status">
          <LoadingSpinner label="Loading more recipes" />
        </div>
      ) : null}
      {nextCursor ? (
        <div aria-hidden="true" className="cp-board__sentinel" ref={loadMoreSentinelRef} />
      ) : null}
      {showRecipeDeletedToast ? <RecipeDeletedToast /> : null}
      {isImportOpen && !importRequiresAuth ? (
        <ImportRecipeDialog
          onClose={closeImportDialog}
          onComplete={(recipeId) => {
            setIsImportOpen(false);
            router.push(`/recipes/${recipeId}?${IMPORT_DRAFT_SEARCH_PARAM}=1`);
          }}
        />
      ) : null}
      {isMobileFilterDrawerOpen ? (
        <ModalShell
          aria-labelledby="mobile-filter-drawer-title"
          onClose={() => setIsMobileFilterDrawerOpen(false)}
          variant="filters"
        >
          <div className="cp-filter-drawer">
            <div className="cp-filter-drawer__header">
              <div>
                <h2 id="mobile-filter-drawer-title">Sort and filter</h2>
              </div>
            </div>

            <label className="cp-filter-drawer__field">
              <span>Sort</span>
              <div className="cp-sort-select cp-sort-select--drawer">
                <div className="cp-sort-select__control">
                  <SortAscending className="cp-sort-select__icon" size={16} weight="bold" />
                  <select
                    aria-label="Sort recipes"
                    onChange={(event) => setSortOption(event.target.value as RecipeSortOption)}
                    value={sortOption}
                  >
                    {RECIPE_SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <CaretDown className="cp-sort-select__caret" size={14} weight="bold" />
                </div>
              </div>
            </label>

            {allKnownTags.length > 0 ? (
              <section className="cp-filter-drawer__section" aria-labelledby="mobile-filter-tags-title">
                <div className="cp-filter-drawer__section-header">
                  <h3 id="mobile-filter-tags-title">Tags</h3>
                  {activeTagFilters.size > 0 ? (
                    <button onClick={clearTagFilters} type="button">
                      Clear
                    </button>
                  ) : null}
                </div>
                <div className="cp-filter-drawer__tags">
                  {allKnownTags.map((tag) => {
                    const isActive = activeTagFilters.has(tag);

                    return (
                      <button
                        aria-pressed={isActive}
                        className={`cp-filter-tag ${isActive ? "is-active" : ""}`.trim()}
                        key={tag}
                        onClick={() => toggleTagFilter(tag)}
                        type="button"
                      >
                        <TagIconGlyph tag={tag} />
                        <span>{tag}</span>
                        {isActive ? (
                          <X
                            aria-hidden="true"
                            className="cp-filter-tag__remove"
                            size={13}
                            weight="bold"
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </div>
        </ModalShell>
      ) : null}
      {isAuthOpen || (isImportOpen && importRequiresAuth) ? (
        <AuthDialog
          onClose={() => {
            setIsAuthOpen(false);
            if (isImportOpen) {
              closeImportDialog();
            }
          }}
        />
      ) : null}
      {isSettingsOpen ? <SettingsDialog onClose={closeSettingsDialog} /> : null}
    </div>
  );
}


function ImportRecipeDialog({
  onClose,
  onComplete,
}: {
  onClose: () => void;
  onComplete: (recipeId: string) => void;
}) {
  return (
    <ModalShell aria-labelledby="new-recipe-title" onClose={onClose} variant="import">
      <section className="cp-settings-card">
        <div className="cp-settings-card__header">
          <h2 id="new-recipe-title">New recipe</h2>
        </div>
        <ImportRecipePanel framed={false} onComplete={onComplete} />
      </section>
    </ModalShell>
  );
}

function SettingsDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  return (
    <ModalShell aria-labelledby="settings-title" onClose={onClose} variant="settings">
      <SettingsPanel titleId="settings-title" />
    </ModalShell>
  );
}
