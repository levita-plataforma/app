"use client";

import { useActionState } from "react";
import { solicitarDemoAction, type DemoFormState } from "./actions";

const initialState: DemoFormState = { error: null };

export default function DemoForm() {
  const [state, formAction, pending] = useActionState(solicitarDemoAction, initialState);

  if (state.success) {
    return (
      <div className="mkt-form-card">
        <div className="mkt-form-success">
          <h3>¡Gracias por tu interés!</h3>
          <p>Hemos recibido tu solicitud. Nos pondremos en contacto contigo en breve.</p>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="mkt-form-card" noValidate>
      <div className="mkt-form-grid">
        <div className="mkt-form-field">
          <label htmlFor="demo-firstName">Nombre</label>
          <input id="demo-firstName" name="firstName" required autoComplete="given-name" />
        </div>
        <div className="mkt-form-field">
          <label htmlFor="demo-lastName">Apellidos</label>
          <input id="demo-lastName" name="lastName" autoComplete="family-name" />
        </div>
        <div className="mkt-form-field">
          <label htmlFor="demo-church">Iglesia</label>
          <input id="demo-church" name="church" required />
        </div>
        <div className="mkt-form-field">
          <label htmlFor="demo-city">Ciudad</label>
          <input id="demo-city" name="city" autoComplete="address-level2" />
        </div>
        <div className="mkt-form-field">
          <label htmlFor="demo-email">Correo electrónico</label>
          <input id="demo-email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="mkt-form-field">
          <label htmlFor="demo-phone">Teléfono (opcional)</label>
          <input id="demo-phone" name="phone" type="tel" autoComplete="tel" />
        </div>
        <div className="mkt-form-field mkt-form-field--full">
          <label htmlFor="demo-communitySize">Tamaño aproximado de tu comunidad</label>
          <select id="demo-communitySize" name="communitySize" defaultValue="">
            <option value="">Selecciona una opción</option>
            <option value="menos-50">Menos de 50 personas</option>
            <option value="50-200">Entre 50 y 200 personas</option>
            <option value="200-500">Entre 200 y 500 personas</option>
            <option value="mas-500">Más de 500 personas</option>
          </select>
        </div>
        <div className="mkt-form-field mkt-form-field--full">
          <label htmlFor="demo-message">Mensaje (opcional)</label>
          <textarea id="demo-message" name="message" placeholder="Cuéntanos qué necesita tu iglesia" />
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="mkt-form-error">
          {state.error}
        </p>
      ) : null}

      <div className="mkt-form-submit">
        <button type="submit" disabled={pending} className="mkt-btn mkt-btn--primary mkt-btn--block">
          {pending ? "Enviando…" : "Solicitar demo"}
        </button>
      </div>
    </form>
  );
}
