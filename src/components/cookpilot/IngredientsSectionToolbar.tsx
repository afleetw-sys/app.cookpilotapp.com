"use client";

import { Check, Minus, Plus, Swap, X } from "@phosphor-icons/react";
import { useState } from "react";
import { ModalShell } from "@/components/cookpilot/ModalShell";
import { measurementModeTitle, type MeasurementMode } from "@/lib/cookpilot/ingredientDisplay";

const MEASUREMENT_MODES: MeasurementMode[] = ["original", "cups", "metricDisplay"];

export function IngredientMeasurementButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      aria-label="Convert measurements"
      className="cp-ingredients-header__convert-button"
      onClick={onOpen}
      title="Convert measurements"
      type="button"
    >
      <Swap size={16} weight="bold" />
    </button>
  );
}

export function IngredientMeasurementDialog({
  measurementMode,
  onSelectMeasurementMode,
  onClose,
}: {
  measurementMode: MeasurementMode;
  onSelectMeasurementMode: (mode: MeasurementMode) => void;
  onClose: () => void;
}) {
  return (
    <ModalShell aria-labelledby="measurement-dialog-title" onClose={onClose} variant="measurements">
      <button
        aria-label="Close measurement converter"
        className="cp-measurement-dialog__close"
        onClick={onClose}
        type="button"
      >
        <X size={14} weight="bold" />
      </button>
      <div className="cp-measurement-dialog__header">
        <Swap size={22} weight="bold" />
        <div>
          <h2 id="measurement-dialog-title">Convert measurements</h2>
          <p>Switch ingredient amounts for this recipe view.</p>
        </div>
      </div>
      <div className="cp-measurement-dialog__options">
        {MEASUREMENT_MODES.map((mode) => {
          const isSelected = mode === measurementMode;
          return (
            <button
              className={`cp-measurement-dialog__option ${isSelected ? "is-selected" : ""}`.trim()}
              key={mode}
              onClick={() => onSelectMeasurementMode(mode)}
              type="button"
            >
              <span>{measurementModeTitle(mode)}</span>
              {isSelected ? <Check size={17} weight="bold" /> : null}
            </button>
          );
        })}
      </div>
    </ModalShell>
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
  const [inputState, setInputState] = useState({
    servings: currentServings,
    value: String(currentServings),
  });
  const inputValue =
    inputState.servings === currentServings ? inputState.value : String(currentServings);

  return (
    <div className="cp-servings-control cp-servings-control--inline">
      <div className="cp-servings-control__stepper">
        <button
          aria-label="Decrease servings"
          className="cp-servings-control__stepper-button"
          disabled={currentServings <= 1}
          onClick={() => {
            const nextServings = Math.max(1, currentServings - 1);
            setInputState({ servings: nextServings, value: String(nextServings) });
            onDecrement();
          }}
          type="button"
        >
          <Minus size={14} weight="bold" />
        </button>
        <input
          aria-label="Servings"
          className="cp-servings-control__input"
          inputMode="numeric"
          onBlur={() => {
            const parsed = Number.parseInt(inputValue.trim(), 10);
            if (inputValue.trim() === "" || !Number.isFinite(parsed) || parsed < 1) {
              setInputState({ servings: currentServings, value: String(currentServings) });
            }
          }}
          onChange={(event) => {
            const nextValue = event.target.value;
            if (!/^\d*$/.test(nextValue)) return;
            setInputState({ servings: currentServings, value: nextValue });
            if (nextValue.trim() !== "") {
              onServingsInput(nextValue);
            }
          }}
          value={inputValue}
        />
        <button
          aria-label="Increase servings"
          className="cp-servings-control__stepper-button"
          onClick={() => {
            const nextServings = currentServings + 1;
            setInputState({ servings: nextServings, value: String(nextServings) });
            onIncrement();
          }}
          type="button"
        >
          <Plus size={14} weight="bold" />
        </button>
      </div>
    </div>
  );
}
