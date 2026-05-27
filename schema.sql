-- =========================================================================
-- SCRIPT DE INICIALIZACIÓN DE BASE DE DATOS - POKÉMON CARD GAME
-- =========================================================================
-- Este archivo contiene la definición completa del esquema de base de datos
-- compatible con Supabase (PostgreSQL 15+).
--
-- Tablas incluidas:
--   1. public.usuarios (sincronizada automáticamente con auth.users)
--   2. public.cartas (catálogo de cartas con datos semilla)
--   3. public.mazos (mazos de los jugadores)
--   4. public.mazo_cartas (tabla intermedia de muchos a muchos con límite de copias)
--   5. public.partidas (registro de partidas en curso o terminadas)
--   6. public.historial (historial de partidas y obtención de experiencia)
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Eliminar disparadores en tablas de sistema
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2. Eliminar funciones previas
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.procesar_fin_partida() CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;

-- 3. Eliminar tablas (esto elimina automáticamente los disparadores asociados)
DROP TABLE IF EXISTS public.historial CASCADE;
DROP TABLE IF EXISTS public.partidas CASCADE;
DROP TABLE IF EXISTS public.mazo_cartas CASCADE;
DROP TABLE IF EXISTS public.mazos CASCADE;
DROP TABLE IF EXISTS public.cartas CASCADE;
DROP TABLE IF EXISTS public.usuarios CASCADE;

-- 4. Creación de Tablas

-- Tabla: usuarios (Sincronizada con auth.users de Supabase)
CREATE TABLE public.usuarios (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) UNIQUE,
    avatar_url TEXT,
    victorias INTEGER DEFAULT 0 NOT NULL CHECK (victorias >= 0),
    derrotas INTEGER DEFAULT 0 NOT NULL CHECK (derrotas >= 0),
    monedas INTEGER DEFAULT 100 NOT NULL CHECK (monedas >= 0),
    misiones JSONB DEFAULT '[
      {"id": "completar_duelo", "titulo": "Duelo del Día 🌅", "desc": "Completa una batalla vs IA.", "progreso": 0, "objetivo": 1, "recompensa": 30, "completado": false, "reclamado": false},
      {"id": "ganar_duelo", "titulo": "¡Victoria! 🥇", "desc": "Gana una batalla vs IA o PvP.", "progreso": 0, "objetivo": 1, "recompensa": 50, "completado": false, "reclamado": false},
      {"id": "usar_habilidad", "titulo": "Alquimista de Habilidades ✨", "desc": "Usa una habilidad especial en batalla 2 veces.", "progreso": 0, "objetivo": 2, "recompensa": 40, "completado": false, "reclamado": false}
    ]'::jsonb,
    logros JSONB DEFAULT '{
      "primer_duelo": {"titulo": "Primer Duelo ⚔️", "desc": "Completa tu primera batalla (vs IA o PvP).", "progreso": 0, "objetivo": 1, "recompensa": 50, "completado": false, "reclamado": false},
      "estratega": {"titulo": "Estratega de la Arena 🏆", "desc": "Gana 5 batallas en total.", "progreso": 0, "objetivo": 5, "recompensa": 150, "completado": false, "reclamado": false},
      "super_efectivo": {"titulo": "Aplastando Rivalidades 💥", "desc": "Inflige un golpe elemental súper efectivo.", "progreso": 0, "objetivo": 1, "recompensa": 80, "completado": false, "reclamado": false},
      "paralizador": {"titulo": "Maestro Paralizador ⚡", "desc": "Paraliza a un oponente 3 veces.", "progreso": 0, "objetivo": 3, "recompensa": 100, "completado": false, "reclamado": false},
      "incendio": {"titulo": "Incendio Forestal 🔥", "desc": "Quema a un oponente 3 veces.", "progreso": 0, "objetivo": 3, "recompensa": 100, "completado": false, "reclamado": false}
    }'::jsonb,
    fecha_misiones VARCHAR(10) DEFAULT '2026-05-26' NOT NULL,
    reverso_equipado VARCHAR(100) DEFAULT 'default' NOT NULL,
    cosmeticos JSONB DEFAULT '["default"]'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabla: cartas (Catálogo global del juego)
CREATE TABLE public.cartas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(255) NOT NULL,
    imagen TEXT,
    tipo VARCHAR(50) NOT NULL, -- Ej: Fuego, Agua, Planta, Eléctrico, Psíquico, Normal
    ataque INTEGER DEFAULT 0 NOT NULL CHECK (ataque >= 0),
    defensa INTEGER DEFAULT 0 NOT NULL CHECK (defensa >= 0),
    vida INTEGER DEFAULT 0 NOT NULL CHECK (vida >= 0),
    habilidad TEXT,
    rareza VARCHAR(50) DEFAULT 'Común' NOT NULL, -- Ej: Común, Rara, Épica, Legendaria
    descripcion TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabla: mazos
CREATE TABLE public.mazos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    nombre VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabla: mazo_cartas (Muchos a muchos entre Mazos y Cartas con cantidad)
CREATE TABLE public.mazo_cartas (
    mazo_id UUID NOT NULL REFERENCES public.mazos(id) ON DELETE CASCADE,
    carta_id UUID NOT NULL REFERENCES public.cartas(id) ON DELETE CASCADE,
    cantidad INTEGER DEFAULT 1 NOT NULL CHECK (cantidad > 0 AND cantidad <= 4), -- Límite estándar TCG
    PRIMARY KEY (mazo_id, carta_id)
);

-- Tabla: usuario_cartas (Colección de cartas desbloqueadas por el usuario)
CREATE TABLE public.usuario_cartas (
    usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    carta_id UUID NOT NULL REFERENCES public.cartas(id) ON DELETE CASCADE,
    cantidad INTEGER DEFAULT 1 NOT NULL CHECK (cantidad >= 0),
    PRIMARY KEY (usuario_id, carta_id)
);

-- Tabla: partidas (Registro de partidas y emparejamientos)
-- Nota: jugador1_id y jugador2_id son nulables con ON DELETE SET NULL para que si
-- un usuario borra su cuenta, la partida e historial sigan existiendo para el otro jugador.
CREATE TABLE public.partidas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jugador1_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    jugador2_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    ganador_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    estado VARCHAR(50) DEFAULT 'esperando' NOT NULL CHECK (estado IN ('esperando', 'en_progreso', 'terminada', 'abandonada')),
    modo VARCHAR(50) DEFAULT 'casual' NOT NULL CHECK (modo IN ('casual', 'competitivo', 'vs_ia')),
    estado_juego JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT check_diferentes_jugadores CHECK (jugador1_id <> jugador2_id OR jugador2_id IS NULL),
    CONSTRAINT check_ganador_es_jugador CHECK (ganador_id = jugador1_id OR ganador_id = jugador2_id OR ganador_id IS NULL)
);

-- Tabla: historial (Registro individual de resultados para cada usuario)
CREATE TABLE public.historial (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    partida_id UUID NOT NULL REFERENCES public.partidas(id) ON DELETE CASCADE,
    resultado VARCHAR(20) NOT NULL CHECK (resultado IN ('victoria', 'derrota', 'empate')),
    xp_ganada INTEGER DEFAULT 0 NOT NULL CHECK (xp_ganada >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =========================================================================
-- ÍNDICES (Optimización de búsquedas y JOINS)
-- =========================================================================
CREATE INDEX idx_mazos_usuario ON public.mazos(usuario_id);
CREATE INDEX idx_mazo_cartas_carta ON public.mazo_cartas(carta_id);
CREATE INDEX idx_partidas_jugador1 ON public.partidas(jugador1_id);
CREATE INDEX idx_partidas_jugador2 ON public.partidas(jugador2_id);
CREATE INDEX idx_partidas_ganador ON public.partidas(ganador_id);
CREATE INDEX idx_historial_usuario ON public.historial(usuario_id);
CREATE INDEX idx_historial_partida ON public.historial(partida_id);

-- =========================================================================
-- FUNCIONES Y DISPARADORES (TRIGGERS)
-- =========================================================================

-- 1. Sincronización automática de perfil al registrarse en Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.usuarios (id, username, email, avatar_url)
    VALUES (
        NEW.id,
        COALESCE(
            NEW.raw_user_meta_data->>'username', 
            SPLIT_PART(NEW.email, '@', 1)
        ),
        NEW.email,
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- 2. Automatización del timestamp "updated_at" en partidas
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_partidas_updated_at
BEFORE UPDATE ON public.partidas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Trigger inteligente de fin de partida (actualiza victorias/derrotas y llena historial)
CREATE OR REPLACE FUNCTION public.procesar_fin_partida()
RETURNS TRIGGER AS $$
DECLARE
    perdedor_id UUID;
BEGIN
    -- Se activa únicamente cuando el estado pasa a 'terminada' y hay un ganador definido
    IF (NEW.estado = 'terminada' AND OLD.estado <> 'terminada' AND NEW.ganador_id IS NOT NULL) THEN
        
        -- 1. Incrementar victoria al ganador
        UPDATE public.usuarios 
        SET victorias = victorias + 1 
        WHERE id = NEW.ganador_id;
        
        -- 2. Determinar quién es el perdedor
        IF NEW.ganador_id = NEW.jugador1_id THEN
            perdedor_id := NEW.jugador2_id;
        ELSE
            perdedor_id := NEW.jugador1_id;
        END IF;
        
        -- 3. Incrementar derrota al perdedor (si existe y no es una partida vs IA representada por NULL)
        IF perdedor_id IS NOT NULL THEN
            UPDATE public.usuarios 
            SET derrotas = derrotas + 1 
            WHERE id = perdedor_id;
        END IF;
        
        -- 4. Registrar automáticamente en el Historial para Jugador 1
        IF NEW.jugador1_id IS NOT NULL THEN
            INSERT INTO public.historial (usuario_id, partida_id, resultado, xp_ganada)
            VALUES (
                NEW.jugador1_id,
                NEW.id,
                CASE WHEN NEW.ganador_id = NEW.jugador1_id THEN 'victoria' ELSE 'derrota' END,
                CASE WHEN NEW.ganador_id = NEW.jugador1_id THEN 100 ELSE 20 END
            );
        END IF;
        
        -- 5. Registrar automáticamente en el Historial para Jugador 2 (si no es IA)
        IF NEW.jugador2_id IS NOT NULL THEN
            INSERT INTO public.historial (usuario_id, partida_id, resultado, xp_ganada)
            VALUES (
                NEW.jugador2_id,
                NEW.id,
                CASE WHEN NEW.ganador_id = NEW.jugador2_id THEN 'victoria' ELSE 'derrota' END,
                CASE WHEN NEW.ganador_id = NEW.jugador2_id THEN 100 ELSE 20 END
            );
        END IF;
        
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_partida_terminada
AFTER UPDATE ON public.partidas
FOR EACH ROW
EXECUTE FUNCTION public.procesar_fin_partida();

-- =========================================================================
-- DATOS SEMILLA (SEED DATA)
-- =========================================================================
INSERT INTO public.cartas (nombre, imagen, tipo, ataque, defensa, vida, habilidad, rareza, descripcion)
VALUES 
(
    'Pikachu', 
    'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png', 
    'Eléctrico', 
    50, 30, 90, 
    'Impactrueno: Tiene un 30% de probabilidad de paralizar al oponente.', 
    'Común', 
    'Cuando varios de estos Pokémon se juntan, su electricidad puede acumularse y causar tormentas eléctricas.'
),
(
    'Charizard', 
    'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/6.png', 
    'Fuego', 
    120, 80, 180, 
    'Llamarada: Descarga un fuego abrasador que reduce la defensa del rival por 2 turnos.', 
    'Legendaria', 
    'Escupe fuego tan caliente que puede fundir rocas. Se sabe que causa incendios forestales sin querer.'
),
(
    'Blastoise', 
    'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/9.png', 
    'Agua', 
    80, 120, 200, 
    'Hidrobomba: Lanza chorros de agua a alta presión que reducen el ataque del rival.', 
    'Épica', 
    'Un Pokémon brutal con cañones de agua presurizada que sobresalen de su caparazón.'
),
(
    'Venusaur', 
    'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/3.png', 
    'Planta', 
    75, 110, 210, 
    'Drenadoras: Absorbe 20 puntos de salud del enemigo al final de cada turno.', 
    'Épica', 
    'Lleva una gran flor en su lomo. Si recibe suficiente sol, los pétalos se llenan de colores vivos.'
),
(
    'Mewtwo', 
    'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/150.png', 
    'Psíquico', 
    130, 90, 190, 
    'Onda Mental: Daña gravemente y bloquea las habilidades del rival por 1 turno.', 
    'Legendaria', 
    'Fue creado por un científico tras años de horribles experimentos de ingeniería genética.'
),
(
    'Eevee', 
    'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/133.png', 
    'Normal', 
    30, 30, 70, 
    'Adaptabilidad: Incrementa el daño en 10 puntos por cada carta de energía diferente en juego.', 
    'Común', 
    'Su estructura genética es muy irregular. El ADN de este Pokémon puede mutar debido a diversos estímulos.'
),
(
    'Dragonite', 
    'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/149.png', 
    'Normal', 
    140, 90, 220, 
    'Hiperrayo: Lanza un rayo devastador que causa 140 de daño pero consume 2 de energía.', 
    'Legendaria', 
    'Se dice que este Pokémon vive en algún lugar del océano. Vuela a gran velocidad para salvar a gente que se está ahogando.'
),
(
    'Gengar', 
    'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/94.png', 
    'Psíquico', 
    90, 60, 140, 
    'Pesadilla Neón: Duerme y causa veneno al oponente con un 50% de probabilidad.', 
    'Épica', 
    'A veces, en noches frías, las sombras que se proyectan bajo las farolas pueden adelantarte de repente. Es obra de Gengar.'
),
(
    'Gyarados', 
    'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/130.png', 
    'Agua', 
    100, 80, 180, 
    'Furia Dragón: Lanza olas gigantescas que infligen 100 de daño letal.', 
    'Épica', 
    'Es un Pokémon extremadamente violento. Cuando sale a la superficie arrasa con todo a su paso en una furia ciega.'
),
(
    'Snorlax', 
    'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/143.png', 
    'Normal', 
    50, 100, 250, 
    'Giga Impacto: Cura 40 HP y causa 50 de daño en un solo impacto.', 
    'Rara', 
    'Su estómago puede digerir cualquier tipo de comida, incluso mohosa o podrida. Pasa el día durmiendo y comiendo.'
),
(
    'Machamp', 
    'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/68.png', 
    'Normal', 
    90, 70, 160, 
    'Puño Dinámico: Golpe demoledor que aturde (paraliza) con un 30% de probabilidad.', 
    'Rara', 
    'Usa sus cuatro brazos para dar puñetazos de forma simultánea a una velocidad asombrosa.'
),
(
    'Jolteon', 
    'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/135.png', 
    'Eléctrico', 
    80, 60, 120, 
    'Chispazo: Descarga una tormenta de chispas que paraliza con un 40% de probabilidad.', 
    'Rara', 
    'Acumula iones negativos en la atmósfera para lanzar rayos de hasta 10000 voltios.'
);

-- =========================================================================
-- SEGURIDAD: ROW LEVEL SECURITY (RLS) & POLÍTICAS
-- =========================================================================

-- 1. Habilitar RLS en todas las tablas
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cartas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mazos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mazo_cartas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_cartas ENABLE ROW LEVEL SECURITY;

-- 2. Políticas para 'usuarios'
CREATE POLICY "Lectura pública de perfiles" ON public.usuarios 
    FOR SELECT USING (true);

CREATE POLICY "Propietarios pueden actualizar su propio perfil" ON public.usuarios 
    FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE POLICY "Usuarios pueden insertar su propio perfil" ON public.usuarios 
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- 3. Políticas para 'cartas'
CREATE POLICY "Lectura pública de cartas" ON public.cartas 
    FOR SELECT USING (true);

-- 4. Políticas para 'mazos'
CREATE POLICY "Propietarios pueden ver sus mazos" ON public.mazos 
    FOR SELECT TO authenticated USING (auth.uid() = usuario_id);

CREATE POLICY "Propietarios pueden gestionar sus mazos" ON public.mazos 
    FOR ALL TO authenticated USING (auth.uid() = usuario_id) WITH CHECK (auth.uid() = usuario_id);

-- 5. Políticas para 'mazo_cartas'
CREATE POLICY "Propietarios pueden gestionar cartas de sus mazos" ON public.mazo_cartas 
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.mazos 
            WHERE mazos.id = mazo_cartas.mazo_id AND mazos.usuario_id = auth.uid()
        )
    );

-- 6. Políticas para 'partidas'
CREATE POLICY "Lectura de partidas en curso o creadas" ON public.partidas 
    FOR SELECT USING (true);

CREATE POLICY "Usuarios pueden crear partidas" ON public.partidas 
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = jugador1_id);

CREATE POLICY "Jugadores pueden actualizar su partida activa" ON public.partidas 
    FOR UPDATE TO authenticated 
    USING (
        auth.uid() = jugador1_id 
        OR auth.uid() = jugador2_id 
        OR (estado = 'esperando' AND jugador2_id IS NULL)
    )
    WITH CHECK (
        auth.uid() = jugador1_id 
        OR auth.uid() = jugador2_id
        OR (estado = 'esperando')
    );

CREATE POLICY "Jugadores pueden eliminar sus partidas" ON public.partidas 
    FOR DELETE TO authenticated 
    USING (auth.uid() = jugador1_id);

-- Habilitar Realtime en la tabla partidas (necesario para suscripciones PvP)
-- NOTA: Ejecutar manualmente en Supabase Dashboard:
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.partidas;

-- 7. Políticas para 'historial'
CREATE POLICY "Usuarios pueden ver su historial propio" ON public.historial 
    FOR SELECT TO authenticated USING (auth.uid() = usuario_id);

-- 8. Políticas para 'usuario_cartas'
CREATE POLICY "Propietarios pueden ver su propia coleccion" ON public.usuario_cartas
    FOR SELECT TO authenticated USING (auth.uid() = usuario_id);

CREATE POLICY "Propietarios pueden gestionar su propia coleccion" ON public.usuario_cartas
    FOR ALL TO authenticated USING (auth.uid() = usuario_id) WITH CHECK (auth.uid() = usuario_id);
