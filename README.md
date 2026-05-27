# ⚔️ Pokémon Card Game - Academia Táctica

¡Bienvenido a **Pokémon Card Game**, una aplicación web premium de alto rendimiento diseñada como un portafolio de producción interactivo! Este proyecto transforma el clásico juego de cartas coleccionables en una experiencia web inmersiva, combinando tecnologías de vanguardia, animaciones fluidas y una arquitectura limpia y escalable.

Desarrollado con **Angular (Standalone Architecture)** y **Supabase** como backend en tiempo real, esta plataforma está optimizada para ofrecer una jugabilidad táctica excepcional contra una Inteligencia Artificial, integrando sonido interactivo, notificaciones dinámicas y compatibilidad completa con PWA (Progressive Web App).

---

## ✨ Características Destacadas

### 🎮 1. Experiencia de Batalla Inmersiva
*   **Animaciones de Combate**: Embestidas físicas al atacar, sacudidas y destellos rojos al recibir daño, y desvanecimiento cinemático cuando un Pokémon se debilita.
*   **Transición de Turnos**: Banners animados gigantescos que anuncian de forma elegante e interactiva el cambio de posesión del turno.
*   **Carga de Energía Reactiva**: Animación de partículas y destellos de energía en la interfaz al acumular energía táctica.
*   **Sistema de Log en Tiempo Real**: Bitácora interactiva de combate con autodesplazamiento inteligente que registra cada acción táctica del jugador y del oponente de la IA.

### 🎵 2. Sistema de Audio Inteligente & SFX
*   **Gestor de Audio Global (`AudioService`)**: Utiliza Angular Signals para un control reactivo impecable del estado de volumen y silencio.
*   **Música Temática de Fondo (BGM)**: Pistas personalizadas según el contexto (`lobby-theme.mp3` y `battle-theme.mp3`) con manejo inteligente de políticas de autoplay (reintentos basados en clics del usuario).
*   **Efectos de Sonido Premium (SFX)**: Sonidos de interacción (hover, click) e hitos del juego (ataques, daño, debilitado, victoria y derrota).
*   **Persistencia Local**: Preferencias de audio recordadas automáticamente en `localStorage`.

### 🖥️ 3. UI/UX Futurista & Glassmorphism
*   **Cinemática de Inicio (Splash Screen)**: Una impresionante animación de carga con una Pokéball animada tridimensional que pulsa y gira en CSS puro mientras inicializa la conexión encriptada y carga recursos.
*   **Modal de Ajustes Premium**: Control deslizante de volumen, interruptor rápido de silencio y botón de pantalla completa con respuestas táctiles-auditivas inmediatas.
*   **Pantalla Completa Nativa**: Integración directa con la API de pantalla completa nativa de HTML5 para una inmersión competitiva total.
*   **Debugger Integrado**: Panel colapsable premium en el pie de página para monitorear en vivo la sesión del jugador y el estado de Supabase.

### 🔔 4. Sistema de Notificaciones Reactivo (`ToastService`)
*   **Toasts Flotantes Modernos**: Notificaciones elegantes en la esquina superior derecha con bordes de color neón interactivos según la categoría (`success`, `error`, `info`, `warning`).
*   **Gestión por Signals**: Las notificaciones se encolan y desencolan de forma reactiva con micro-transiciones CSS de deslizamiento lateral.

### 📱 5. Soporte PWA y Modo Offline
*   **Manifest Oficial**: Configurado con un icono neón tridimensional de alta definición (`icon-512.png`) y esquemas de colores integrados para dispositivos móviles y de escritorio.
*   **Service Worker (`sw.js`)**: Maneja estrategias de caché inteligentes para los recursos de la app shell, garantizando que el juego cargue al instante.
*   **Pantalla Offline Personalizada (`offline.html`)**: Si el entrenador pierde la conexión, la aplicación muestra una interfaz interactiva de Game Boy retro con ondas de radar animadas para reconectar la arena de forma segura.

---

## 🛠️ Arquitectura Técnica y Estructura

El proyecto se basa estrictamente en la arquitectura de **Componentes Standalone** de Angular, eliminando la necesidad de módulos tradicionales y acelerando los tiempos de compilación y carga gracias al uso del builder ultrarrápido basado en esbuild/Vite.

```
pokemon-card-game/
├── public/
│   ├── favicon.ico
│   ├── icon-512.png            <-- Logotipo premium PWA generado
│   ├── manifest.webmanifest    <-- Manifiesto PWA de instalación
│   ├── sw.js                   <-- Service Worker inteligente
│   └── offline.html            <-- Pantalla retro offline
├── src/
│   ├── app/
│   │   ├── components/         <-- Componentes compartidos (navbar)
│   │   ├── guards/             <-- Protectores de ruta (authGuard, alreadyAuthGuard)
│   │   ├── pages/              <-- Vistas cargadas perezosamente (lazy loading)
│   │   │   ├── battle/         <-- Componente de la Arena de Combate
│   │   │   ├── dashboard/      <-- Dashboard de Jugador
│   │   │   ├── deck-builder/   <-- Creador de Mazos Tácticos
│   │   │   └── login / register <-- Vistas de autenticación
│   │   ├── services/
│   │   │   ├── audio.ts        <-- Servicio Global de Sonido con Signals
│   │   │   ├── toast.ts        <-- Servicio Reactivo de Notificaciones
│   │   │   └── supabase.ts     <-- Cliente y consultas Supabase optimizadas
│   │   ├── app.ts              <-- Componente Raíz
│   │   ├── app.html            <-- Template Raíz con Splash, Modal & Toasts
│   │   └── app.css             <-- Estilos globales premium de Layout
│   ├── environments/           <-- Configuraciones Dev / Prod
│   ├── index.html              <-- HTML Raíz con PWA hooks e inicialización
│   └── styles.css              <-- Sistema de diseño de variables y scrollbars
```

### Optimización y Rendimiento
*   **Rutas Lazy Loading**: Carga bajo demanda de componentes pesados (como la Arena de Batalla o el Deck Builder) utilizando `loadComponent: () => import(...)` para mantener el bundle inicial por debajo del límite de advertencia de 500kB.
*   **Angular Signals**: Estado sincronizado y reactividad de grano fino para evitar re-renderizados innecesarios del DOM.
*   **Vanilla CSS**: Rendimiento de renderizado óptimo y tiempos de carga instantáneos al evitar frameworks CSS pesados.

---

## 🚀 Instalación y Desarrollo Local

### Requisitos Previos
*   [Node.js](https://nodejs.org/) (versión v18 o superior recomendada).
*   Angular CLI instalado globalmente: `npm install -g @angular/cli`.

### Pasos para Empezar

1.  **Clonar el repositorio y entrar al proyecto**:
    ```bash
    git clone https://github.com/tu-usuario/pokemon-card-game.git
    cd pokemon-card-game/pokemon-card-game
    ```

2.  **Instalar las dependencias**:
    ```bash
    npm install
    ```

3.  **Iniciar el servidor de desarrollo**:
    ```bash
    npm start
    ```
    *Abre [http://localhost:4200](http://localhost:4200) en tu navegador para ver la espectacular cinemática de carga y comenzar a jugar.*

---

## 📦 Compilación y Preparación para Producción

Para compilar el proyecto optimizando los paquetes finales con compresión de estilos, minificación de scripts esbuild y hashes de caché, ejecuta:

```bash
npm run build
```

Esto generará la app compilada en el directorio `dist/pokemon-card-game/browser`, lista para ser desplegada en plataformas de alojamiento en la nube de forma instantánea.

### Configuración del Despliegue (Vercel / Netlify / Cloudflare Pages)

Este proyecto está configurado para desplegarse con un solo clic. Para evitar problemas con el enrutamiento interno de Angular (`Router`), asegúrate de configurar los redireccionamientos en el host:

*   **Vercel (`vercel.json`)**:
    ```json
    {
      "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
    }
    ```
*   **Netlify (`_redirects`)**:
    ```text
    /*    /index.html   200
    ```

---

## 🛡️ Base de Datos y Seguridad (Supabase RLS)
Las consultas a la base de datos están validadas mediante políticas nativas de **Row Level Security (RLS)** en Supabase. Las tablas clave (`partidas`, `usuarios`, `cartas`, `historial`) se encuentran protegidas para que un usuario autenticado solo pueda ver e interactuar con sus propios mazos e historiales, previniendo inyecciones de ID ajenos.

---

## 🎨 Paleta de Diseño
*   **Fondo Profundo**: `#0b0d19` (Estilo Cyberpunk / Espacial)
*   **Acento Cyan Neón**: `#00e5ff` (Indicadores de tecnología y flujos de energía)
*   **Acento Rojo Fuego**: `#ff1744` (Daño, CPU y alarmas críticas)
*   **Acento Verde Planta**: `#00e676` (Victorias, éxitos y HP alto)
*   **Acento Amarillo Eléctrico**: `#ffd600` (Energía y advertencias de combate)
