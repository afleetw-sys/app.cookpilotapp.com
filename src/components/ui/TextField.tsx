"use client";

import { Eye, EyeSlash } from "@phosphor-icons/react";
import { useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

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
  const [showPassword, setShowPassword] = useState(false);

  const isPassword = !multiline && (rest as InputHTMLAttributes<HTMLInputElement>).type === "password";

  return (
    <label className={`cp-field ${className}`.trim()}>
      {label ? <span className="cp-field__label">{label}</span> : null}
      {multiline ? (
        <textarea
          {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
          className="cp-field__control cp-field__control--textarea"
        />
      ) : isPassword ? (
        <div className="cp-field__password-wrap">
          <input
            {...(rest as InputHTMLAttributes<HTMLInputElement>)}
            className="cp-field__control cp-field__control--password"
            type={showPassword ? "text" : "password"}
          />
          <button
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="cp-field__password-toggle"
            onClick={() => setShowPassword((v) => !v)}
            type="button"
          >
            {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
          </button>
        </div>
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
