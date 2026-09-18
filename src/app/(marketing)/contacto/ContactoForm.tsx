"use client";

import { useActionState } from "react";
import { enviarContactoAction, type ContactoFormState } from "./actions";

const initialState: ContactoFormState = { error: null };

export default function ContactoForm() {
  const [state, formAction, pending] = useActionState(enviarContactoAction, initialState);

  if (state.success) {
    return (
      <div className="mkt-form-card">
        <div className="mkt-form-success">
          <h3>Mensaje enviado</h3>
          <p>Gracias por escribirnos. Te responderemos lo antes posible.</p>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="mkt-form-card" noValidate>
      <div className="mkt-form-grid">
        <div className="mkt-form-field mkt-form-field--full">
          <label htmlFor="contacto-name">Nombre</label>
          <input id="contacto-name" name="name" required autoComplete="name" />
        </div>
        <div className="mkt-form-field mkt-form-field--full">
          <label htmlFor="contacto-email">Correo electrónico</label>
          <input id="contacto-email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="mkt-form-field mkt-form-field--full">
          <label htmlFor="contacto-message">Mensaje</label>
          <textarea id="contacto-message" name="message" required placeholder="¿En qué podemos ayudarte?" />
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="mkt-form-error">
          {state.error}
        </p>
      ) : null}

      <div className="mkt-form-submit">
        <button type="submit" disabled={pending} className="mkt-btn mkt-btn--primary mkt-btn--block">
          {pending ? "Enviando…" : "Enviar mensaje"}
        </button>
      </div>
    </form>
  );
}
