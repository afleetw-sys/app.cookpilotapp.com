"use client";

import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

type BaseProps = {
  label?: string;
  hint?: string | null;
  error?: string | null;
  className?: string;
};

type InputProps = BaseProps &
  InputHTMLAttributes<HTMLInputElement> & {
    multiline?: false;
  };

type TextareaProps = BaseProps &
  TextareaHTMLAttributes<HTMLTextAreaElement> & {
    multiline: true;
  };

export function TextField(props: InputProps | TextareaProps) {
  const { label, hint, error, className = "", multiline, ...rest } = props;

  return (
    <label className={`cp-field ${className}`.trim()}>
      {label ? <span className="cp-field__label">{label}</span> : null}
      {multiline ? (
        <textarea
          {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
          className="cp-field__control cp-field__control--textarea"
        />
      ) : (
        <input
          {...(rest as InputHTMLAttributes<HTMLInputElement>)}
          className="cp-field__control"
        />
      )}
      {error ? <span className="cp-field__message cp-field__message--error">{error}</span> : null}
      {!error && hint ? <span className="cp-field__message">{hint}</span> : null}
    </label>
  );
}
