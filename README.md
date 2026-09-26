# Batalla Naval — Empresas

Juego clásico de **Batalla Naval** con flotas de **7 empresas**. Interfaz en español (México).

Modos: **2 jugadores** (pass-and-play en el mismo dispositivo) o **vs CPU** (Fácil / Medio / Difícil).

No requiere instalación ni npm: solo HTML, CSS y JavaScript. Funciona **sin conexión** (doble clic en `index.html`).

## Cómo abrir

### Opción A — Archivo local
1. Abre la carpeta `batalla-naval`.
2. Haz doble clic en `index.html` (Chrome, Firefox, Edge o Safari).

### Opción B — Servidor local
```bash
python3 -m http.server 8080
# o: npx --yes serve -p 8080
```
Luego visita [http://localhost:8080](http://localhost:8080).

Las tipografías de Google Fonts requieren red la primera vez; sin internet se usan fuentes del sistema. El sonido y la música se generan con la **Web Audio API** (sin archivos externos).

## Opciones al inicio

| Opción | Descripción |
|--------|-------------|
| **Modo** | `2 jugadores` (hot-seat con pantallas de privacidad) o `vs CPU` |
| **Dificultad CPU** | Fácil (casi aleatorio), Medio (caza adyacente tras un tocado), Difícil (sigue la línea de impactos, calcula dónde es más probable que haya barcos y respeta la regla de separación; **no hace trampa**: solo usa lo que vería un jugador) |
| **Partida** | **Normal** 10×10 (flota completa) o **Rápida** 8×8 (longitudes reducidas) |
| **Barcos separados** | Si está activo, los barcos no pueden tocarse ni en diagonal (mín. 1 casilla libre alrededor) |
| **Acento del tema** | Cian / Turquesa / Azul (se recuerda) |
| **Nombres** | Jugador 1 y Jugador 2 (o nombre de la CPU) |

Preferencias recordadas en `localStorage`: nombres (el del Jugador 2 y el de la CPU por separado), modo, dificultad, tamaño, separación, silencio, música, texto grande y tema.

### Continuar / Nueva partida
Si hay una partida guardada válida aparece **Continuar partida**. **Nueva partida** borra el guardado y muestra el formulario. El juego auto-guarda tras colocar flotas y tras cada disparo (ya con el turno del rival, así recargar la página no regala un disparo extra); el guardado se limpia al ganar o al elegir nueva partida / inicio. En 2 jugadores, al continuar aparece primero la pantalla de privacidad.

## Cómo jugar

### vs CPU
1. Elige vs CPU, dificultad y opciones → **Comenzar partida**.
2. Coloca tu flota (o **Aleatorio**) → **Confirmar flota**. La CPU coloca la suya al azar (respetando la separación si aplica).
3. Ves **ambos tableros** siempre (sin handoff). Disparas; la CPU responde con un breve retraso.

Durante la colocación puedes hacer clic en un barco ya colocado (en el tablero o en la lista) para quitarlo y recolocarlo.

### 2 jugadores
1. Pantalla de privacidad → Jugador 1 coloca → pasa el dispositivo → Jugador 2 coloca.
2. Batalla con handoff tras cada disparo.

### Controles de partida (HUD superior derecho)
- **Menú** — vuelve al inicio sin perder la partida (aparece **Continuar partida**).
- **Música** — ambiente suave generado (por defecto off). Independiente de los SFX.
- **Sonido / Silencio** — efectos (agua, tocado, hundido, victoria, clics).
- **Texto** — tipografía más grande (cómodo en portátil / pass-and-play).
- **Pantalla** — pantalla completa (Fullscreen API).

## Reglas

- Barcos en horizontal o vertical, sin salirse ni solaparse.
- Con **Barcos separados**: tampoco pueden compartir vecindad (incluye diagonales).
- Un disparo por turno: **Agua**, **Tocado** o **Hundido** (se anuncia la empresa).
- Gana quien hunda toda la flota rival.
- Al empezar tu turno verás dónde disparó el rival (mensaje + casilla marcada en dorado en tu tablero).
- Al hundir: banner «¡Hundiste X!» + breve modo teatro (zoom/pulso ~1 s; se puede saltar con la siguiente acción o Escape).

## Flotas

### Normal (10×10) — 24 casillas

| Empresa | Casillas | Color |
|---------|----------|-------|
| Apple | 5 | plata |
| Microsoft | 4 | azul |
| Amazon | 4 | naranja |
| Google | 3 | azul Google |
| NVIDIA | 3 | verde |
| Saudi Aramco | 3 | cian |
| Tesla | 2 | rojo |

### Rápida (8×8) — 18 casillas (mismas 7 empresas)

| Empresa | Casillas |
|---------|----------|
| Apple | 4 |
| Microsoft | 3 |
| Amazon | 3 |
| Google | 2 |
| NVIDIA | 2 |
| Saudi Aramco | 2 |
| Tesla | 2 |

Cada empresa tiene un **chip de color** en la lista de flota y un relleno sutil en las casillas colocadas (igual para ambos jugadores).

## Estadísticas finales

La pantalla de victoria muestra para ambos lados (en vs CPU y en PvP):

- Disparos, aciertos, precisión %, barcos hundidos, turnos.

## Archivos

| Archivo | Contenido |
|---------|-----------|
| `index.html` | Estructura y pantallas |
| `styles.css` | Tema océano / UI / teatro / texto grande |
| `game.js` | Lógica, CPU, guardado, audio |
| `README.md` | Este documento |

## Controles rápidos

- **R** o **clic derecho** — girar barco (colocación)
- Clic en un barco colocado — quitarlo para recolocarlo
- Clic — colocar / disparar
- **Flechas** + **Enter** — moverse por el tablero y colocar / disparar con teclado
- **Listo** — continuar tras pasar el dispositivo (solo PvP)
- **Escape** — cerrar efecto teatro
- HUD — música, SFX, texto grande, pantalla completa

¡Que gane la mejor flota corporativa!
