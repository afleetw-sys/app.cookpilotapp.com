"use client";

import { CaretDown, Check, Minus, Plus } from "@phosphor-icons/react";
import type { RefObject } from "react";
import { measurementModeTitle, type MeasurementMode } from "@/lib/cookpilot/ingredientDisplay";

const MEASUREMENT_MODES: MeasurementMode[] = ["original", "cups", "metricDisplay"];

export const SERVINGS_MULTIPLIER_OPTIONS = [
  { multiplier: 0.5, label: "½x" },
  { multiplier: 1, label: "1x" },
  { multiplier: 2, label: "2x" },
  { multiplier: 3, label: "3x" },
] as const;

export function ServingsMultiplierPills({
  baseServings,
  currentServings,
  onSelectServings,
}: {
  baseServings: number;
  currentServings: number;
  onSelectServings: (servings: number) => void;
}) {
  if (baseServings <= 0) return null;

  return (
    <div className="cp-servings-control__multipliers" role="group" aria-label="Recipe scale">
      {SERVINGS_MULTIPLIER_OPTIONS.map((option) => {
        const targetServings = Math.max(1, Math.round(baseServings * option.multiplier));
        const isSelected = targetServings === currentServings;

        return (
          <button
            className={`cp-servings-control__pill ${isSelected ? "is-selected" : ""}`.trim()}
            key={option.label}
            onClick={() => onSelectServings(targetServings)}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function IngredientMeasurementDropdown({
  measurementMode,
  showMeasurementMenu,
  onToggleMeasurementMenu,
  onSelectMeasurementMode,
  measurementMenuRef,
}: {
  measurementMode: MeasurementMode;
  showMeasurementMenu: boolean;
  onToggleMeasurementMenu: () => void;
  onSelectMeasurementMode: (mode: MeasurementMode) => void;
  measurementMenuRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      className="cp-ingredients-header__measurements cp-ingredients-header__measurements--title"
      ref={measurementMenuRef}
    >
      <button
        className="cp-ingredients-header__measurement-button"
        onClick={onToggleMeasurementMenu}
        type="button"
      >
        <span>{measurementModeTitle(measurementMode)}</span>
        <CaretDown size={14} weight="bold" />
      </button>
      {showMeasurementMenu ? (
        <div className="cp-ingredients-header__measurement-menu">
          {MEASUREMENT_MODES.map((mode) => (
            <button
              className="cp-ingredients-header__measurement-option"
              key={mode}
              onClick={() => onSelectMeasurementMode(mode)}
              type="button"
            >
              <span>{measurementModeTitle(mode)}</span>
              {mode === measurementMode ? <Check size={16} weight="bold" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function IngredientsServingsControl({
  currentServings,
  onDecrement,
  onIncrement,
  onServingsInput,
}: {
  currentServings: number;
  onDecrement: () => void;
  onIncrement: () => void;
  onServingsInput: (value: string) => void;
}) {
  return (
    <div className="cp-servings-control cp-servings-control--inline">
      <span className="cp-servings-control__label">Servings</span>
      <div className="cp-servings-control__stepper">
        <button
          aria-label="Decrease servings"
          className="cp-servings-control__stepper-button"
          disabled={currentServings <= 1}
          onClick={onDecrement}
          type="button"
        >
          <Minus size={14} weight="bold" />
        </button>
        <input
          aria-label="Servings"
          className="cp-servings-control__input"
          inputMode="numeric"
          onChange={(event) => onServingsInput(event.target.value)}
          value={String(currentServings)}
        />
        <button
          aria-label="Increase servings"
          className="cp-servings-control__stepper-button"
          onClick={onIncrement}
          type="button"
        >
          <Plus size={14} weight="bold" />
        </button>
      </div>
    </div>
  );
}
