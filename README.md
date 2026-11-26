# Ahorro

App para el móvil que controla tus gastos del mes y te dice **cada día cuánto puedes gastar** para cumplir tu meta de ahorro.

- **Hoy puedes gastar X €**: la cifra grande de la pantalla principal, en verde (vas bien), ámbar (con cuidado) o rojo (te has pasado).
- **¿Me lo puedo permitir?**: escribes un precio y te responde al momento: *Sí, puedes*, *Sí, pero ajusta*, *Mejor no* o *No te llega*, con lo que te quedaría al día después.
- **Plan del mes**: ingresos, gastos previstos (alquiler, facturas, suscripciones…) que puedes marcar como pagados, y tu meta de ahorro (en % o cantidad fija).
- **Imprevistos**: un cargo que no esperabas (una suscripción, una factura, una multa) se apunta aparte. No se come lo de un solo día: se reparte entre los días que quedan. Si se va a repetir, pasa a tus gastos fijos.
- **Tu mes va de cobro a cobro**: eliges el día en que cobras (por ejemplo el 27) y "diciembre" va del 27 de noviembre al 26 de diciembre. Si un mes te pagan antes, en los últimos días aparece **¿Ya has cobrado?** para empezar el mes nuevo ese mismo día.
- **Apartar ya**: si gastas menos de lo previsto, la app te avisa de que vas por delante y te deja mover ese dinero al ahorro en el momento.
- **Huchas**: metas de ahorro (un viaje, un colchón para imprevistos…) con la fecha en la que las completarás a tu ritmo, o lo que necesitas al mes para llegar a tiempo.
- **Historial**: cuánto ahorraste cada mes y en qué se va el dinero por categorías.
- Funciona sin conexión, se instala como una app y tiene modo oscuro.

## Cómo calcula

```
Para el día a día = Ingresos − Gastos previstos − Ahorro
Plan diario       = Para el día a día ÷ días del mes

Hoy puedes gastar = (Para el día a día − lo gastado antes de hoy) ÷ días que quedan (con hoy)
                    − lo gastado hoy
```

"El mes" es el periodo entre un cobro y el siguiente (del 1 al último día si eliges cobrar el día 1). Los imprevistos cuentan como gastos de ese mes, así que bajan un poco el límite de todos los días que quedan.

Si un día gastas menos, el límite de los días siguientes sube un poco; si te pasas, baja. El ahorro se aparta primero, así que ahorras desde el día 1 en vez de esperar a ver qué sobra.

El mes en que empiezas a usarla cuenta desde ese día (los días anteriores se dan por gastados según el plan), para que no te salga un límite diario irreal.

## Instalarla en el móvil

La app es una web instalable (PWA): no necesita tienda de apps.

1. Publica esta carpeta en cualquier hosting estático con HTTPS. Con GitHub Pages: **Settings → Pages → Deploy from a branch**, elige la rama y la carpeta `/ (root)`.
2. Abre la dirección en el móvil:
   - **iPhone (Safari)**: botón Compartir → *Añadir a pantalla de inicio*.
   - **Android (Chrome)**: menú ⋮ → *Instalar app*.
3. Se abrirá a pantalla completa con su propio icono, como cualquier app.

Para probarla en el ordenador:

```bash
python3 -m http.server 8000
# y abre http://localhost:8000
```

## Tus datos

Todo se guarda en tu propio dispositivo (no hay servidor ni cuentas). Desde **Ajustes** puedes exportar una copia de seguridad (`.json`) e importarla en otro móvil.

## Archivos

| Archivo | Qué es |
| --- | --- |
| `index.html` | Página de la app |
| `app.js` | Toda la lógica: cálculos, pantallas y guardado |
| `styles.css` | Diseño (modo claro y oscuro) |
| `manifest.webmanifest` | Datos para instalarla como app |
| `sw.js` | Permite usarla sin conexión |
| `icons/` | Iconos de la app |
