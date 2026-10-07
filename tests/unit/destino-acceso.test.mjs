// Pruebas de la decisión de destino tras el login (operador / iglesia / ambos).
// Se ejecutan con `npm run test:unit` (node --test con eliminación de tipos).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  destinoTrasAcceso,
  leerUltimoContexto,
  contextoDeRuta,
} from "../../src/server/auth/destino-acceso.ts";

test("operador sin iglesia va a la consola, no al onboarding", () => {
  assert.equal(destinoTrasAcceso({ esOperador: true, tieneIglesia: false, ultimoContexto: null }), "/operacion");
  assert.equal(destinoTrasAcceso({ esOperador: true, tieneIglesia: false, ultimoContexto: "iglesia" }), "/operacion");
});

test("owner con iglesia y sin plataforma va a la app", () => {
  assert.equal(destinoTrasAcceso({ esOperador: false, tieneIglesia: true, ultimoContexto: null }), "/app");
  assert.equal(destinoTrasAcceso({ esOperador: false, tieneIglesia: true, ultimoContexto: "plataforma" }), "/app");
});

test("operador y owner respeta el último contexto", () => {
  assert.equal(destinoTrasAcceso({ esOperador: true, tieneIglesia: true, ultimoContexto: "plataforma" }), "/operacion");
  assert.equal(destinoTrasAcceso({ esOperador: true, tieneIglesia: true, ultimoContexto: "iglesia" }), "/app");
});

test("operador y owner sin contexto previo elige", () => {
  assert.equal(destinoTrasAcceso({ esOperador: true, tieneIglesia: true, ultimoContexto: null }), "/acceso/contexto");
});

test("sin iglesia ni plataforma mantiene el comportamiento actual (app → alta de iglesia)", () => {
  assert.equal(destinoTrasAcceso({ esOperador: false, tieneIglesia: false, ultimoContexto: null }), "/app");
});

test("la cookie solo admite los dos contextos conocidos", () => {
  assert.equal(leerUltimoContexto("plataforma"), "plataforma");
  assert.equal(leerUltimoContexto("iglesia"), "iglesia");
  assert.equal(leerUltimoContexto("otra"), null);
  assert.equal(leerUltimoContexto(undefined), null);
});

test("las rutas se asignan al contexto correcto", () => {
  assert.equal(contextoDeRuta("/operacion"), "plataforma");
  assert.equal(contextoDeRuta("/operacion/iglesias/123"), "plataforma");
  assert.equal(contextoDeRuta("/app"), "iglesia");
  assert.equal(contextoDeRuta("/app/personas"), "iglesia");
  assert.equal(contextoDeRuta("/acceso/onboarding"), null);
  assert.equal(contextoDeRuta("/aplicacion"), null);
  assert.equal(contextoDeRuta("/operaciones"), null);
});
