"use client";

import { useState, type InputHTMLAttributes } from "react";
import { INPUT } from "./auth-shell";

/** Password field with an accessible show/hide toggle (a real button, announced via aria-pressed). */
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={visible ? "text" : "password"} className={`${INPUT} pr-20`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-controls={props.id}
        className="absolute inset-y-1 right-1 rounded-[10px] px-3 text-sm font-semibold text-plum hover:bg-plum-tint"
      >
        {visible ? "Hide" : "Show"}
        <span className="sr-only"> password</span>
      </button>
    </div>
  );
}
