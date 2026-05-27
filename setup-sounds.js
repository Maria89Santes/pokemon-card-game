const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const soundsDir = path.join(
  'c:',
  'Users',
  'ferna',
  'OneDrive',
  'Escritorio',
  'pokemon-card-game',
  'pokemon-card-game',
  'public',
  'assets',
  'sounds'
);

if (!fs.existsSync(soundsDir)) {
  fs.mkdirSync(soundsDir, { recursive: true });
}

// Enlaces de audio reales, de alta calidad y 100% retro (Música de Pokémon y SFX de Flappy Bird)
const files = [
  {
    name: 'click.mp3', // Guardado como mp3 de forma transparente pero con formato wav nativo retro (sniffing de navegador)
    url: 'https://raw.githubusercontent.com/samuelcust/flappy-bird-assets/master/audio/swoosh.wav'
  },
  {
    name: 'hover.mp3',
    url: 'https://raw.githubusercontent.com/samuelcust/flappy-bird-assets/master/audio/wing.wav'
  },
  {
    name: 'attack.mp3',
    url: 'https://raw.githubusercontent.com/samuelcust/flappy-bird-assets/master/audio/wing.wav'
  },
  {
    name: 'damage.mp3', // Reemplaza la estridente alarma cyberpunk de error por un sutil "hit" clásico
    url: 'https://raw.githubusercontent.com/samuelcust/flappy-bird-assets/master/audio/hit.wav'
  },
  {
    name: 'faint.mp3', // Reemplaza la alarma estridente de warning por el silbido descendente retro al perder
    url: 'https://raw.githubusercontent.com/samuelcust/flappy-bird-assets/master/audio/die.wav'
  },
  {
    name: 'energy.mp3', // Tintineo retro sutil de obtención de moneda
    url: 'https://raw.githubusercontent.com/samuelcust/flappy-bird-assets/master/audio/point.wav'
  },
  {
    name: 'victory.mp3', // Chime suave y alegre de campana retro
    url: 'https://github.com/IonDen/ion.sound/raw/master/sounds/bell_ring.mp3'
  },
  {
    name: 'defeat.mp3', // Efecto sutil de gota de agua (suave y no estresante)
    url: 'https://github.com/IonDen/ion.sound/raw/master/sounds/water_droplet.mp3'
  },
  {
    name: 'lobby-theme.mp3', // Tema oficial alegre y sumamente agradable (Rival May/Brendan en ORAS) de Pokémon
    url: 'https://play.pokemonshowdown.com/audio/oras-rival.mp3'
  },
  {
    name: 'battle-theme.mp3', // Tema legendario de batalla (HGSS Johto Trainer Battle) de Pokémon
    url: 'https://play.pokemonshowdown.com/audio/hgss-johto-trainer.mp3'
  }
];

function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);
    
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };

    https.get(options, (response) => {
      // Seguir redirecciones de CDN (HTTP 301/302)
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadFile(response.headers.location, destination).then(resolve).catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Fallo de servidor: código HTTP ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log(`✅ Descargado exitosamente: ${path.basename(destination)}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destination, () => {});
      reject(err);
    });
  });
}

async function main() {
  console.log('🎵 Descargando sonidos retro chiptune e inspirado en Pokémon sin bloqueos...\n');
  
  for (const sound of files) {
    const destination = path.join(soundsDir, sound.name);
    try {
      console.log(`Descargando ${sound.name}...`);
      await downloadFile(sound.url, destination);
    } catch (error) {
      console.error(`❌ Error al descargar ${sound.name}:`, error.message);
    }
  }
  
  console.log('\n🔥 Sincronización de audio finalizada.');
  console.log('🎮 Los sonidos estresantes han sido reemplazados exitosamente por efectos retro y música oficial de Pokémon.');
}

main();
