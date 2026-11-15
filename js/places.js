// Places you can write in. Each one is a painting plus the measurements the
// scene needs to bring it to life: where the paper sits in the typewriter,
// where every key is, which panes of glass take the weather, and what the
// room can do. Positions that are pure styling live in css/style.css under
// `.place-<id>`.

const rows = (list) => list; // [characters, x centres, y]

export const PLACES = {
  study: {
    id: 'study', name: 'City study', blurb: 'High above the city at dusk',
    tagline: 'A private room, high above the city, for your words.',
    img: 'assets/room.webp',
    paper: { x: 678, w: 322, platen: 493, min: 131, max: 402 },
    typeRect: { x: 590, y: 236, w: 492, h: 532 },
    deskCam: [836, 738],
    keys: {
      w: 27, h: 15,
      rows: rows([
        ['1234567890', [698, 726.5, 755, 784, 812, 840.5, 869, 896.5, 924, 959], 591],
        ['qwertyuiop', [709, 738.5, 767.5, 797, 825, 854, 883, 911, 940, 972], 609.5],
        ['asdfghjkl;', [712.5, 742, 772, 802, 831, 860.5, 890, 920, 948, 977.5], 627.5],
        ['zxcvbnm,.', [725, 755.5, 786, 815.5, 845, 874.5, 904, 934.5, 965], 645],
      ]),
      extra: {
        shiftL: [685, 645, 36], shiftR: [999, 645, 36], space: [842, 668, 232],
        "'": ';', '/': [999, 645, 36], '-': '0', '=': '0', '[': 'p', ']': 'p', '\\': 'p', '`': '1',
        enter: [977.5, 627.5, 27], delete: [959, 591, 27], tab: [709, 609.5, 27],
      },
    },
    weathers: ['rainy', 'snowy', 'sunny'],
    wx: {
      x: 747, y: 0, w: 588, h: 408, alpha: 1, tint: [215, 215, 245], lw: 0.7, len: 1, drips: 0,
      panes: [{ x0: 0, x1: 56, y1: 408, wgt: 0.1 }, { x0: 83, x1: 323, y1: 408, wgt: 0.56 }, { x0: 345, x1: 478, y1: 408, wgt: 0.34 }],
    },
    steam: [56, 158, 1, 1, 1],   // x, y of the cup in the steam canvas; density; rise; spread
    curtains: true, arm: true, dim: 1, day: 1,
    labels: { lamp: 'Desk lamp', window: 'Window & weather', player: 'Record player', playerTitle: 'Now on the turntable', pen: 'Fountain pen', penHint: 'Pick up the pen to write', typeHint: 'Click the typewriter to begin' },
    wxSound: { rainy: 'Rain sound', snowy: 'Wind sound', sunny: 'Outdoor sound' },
    wxName: { rainy: 'Rainy', snowy: 'Snowy', sunny: 'Sunny' },
  },

  cabin: {
    id: 'cabin', name: 'Forest cabin', blurb: 'Rain, a stream and an oil lantern',
    tagline: 'A cabin in the forest, with rain on the glass and a stream outside.',
    img: 'assets/cabin.jpg',
    paper: { x: 719, w: 332, platen: 498, min: 169, max: 412 },
    typeRect: { x: 632, y: 232, w: 492, h: 524 },
    deskCam: [1400, 720],
    keys: {
      w: 26, h: 15,
      rows: rows([
        ['1234567890', [744.5, 772, 800, 825.5, 852.5, 884, 912.5, 939, 965.5, 993], 601.5],
        ['qwertyuiop', [755, 784.5, 813.75, 843, 870.25, 898.25, 926.25, 952.5, 978.5, 1005.25], 622.5],
        ['asdfghjkl;', [758.75, 789.5, 818.75, 848, 876.25, 905, 932.5, 959.5, 985.5, 1012], 644.5],
        ['zxcvbnm,.', [772, 803.25, 832.5, 861.75, 890.75, 920.5, 948.5, 975, 1000], 664],
      ]),
      extra: {
        shiftL: [730, 664, 32], shiftR: [1056.25, 664, 30], space: [893, 688, 226],
        "'": [1040.25, 644.5, 26], '/': [1026.75, 664, 26], '-': [1020.75, 601.5, 26], '=': [1020.75, 601.5, 26],
        '[': [1033.75, 622.5, 26], ']': [1033.75, 622.5, 26], '\\': [1033.75, 622.5, 26], '`': '1',
        enter: [1040.25, 644.5, 26], delete: [1020.75, 601.5, 26], tab: 'q',
      },
    },
    weathers: ['rainy', 'sunny'],
    wx: {
      x: 0, y: 0, w: 1140, h: 610, alpha: 2.6, tint: [244, 249, 252], lw: 1.15, len: 1.7, drips: 0.4,
      panes: [
        { x0: 12, x1: 372, y1: 598, y1b: 522, wgt: 0.46 },   // left window, running away from us
        { x0: 398, x1: 528, y1: 330, wgt: 0.1 },             // its far pane, above the flowers
        { x0: 683, x1: 897, y1: 448, wgt: 0.22 }, { x0: 915, x1: 1130, y1: 448, wgt: 0.22 },
      ],
    },
    steam: [62, 196, 3, 2.1, 1.5],   // a taller plume, and denser so it shows on a sunlit wall
    curtains: false, arm: false, dim: 0.42, day: 0,
    labels: { lamp: 'Oil lantern', window: 'Window & weather', player: 'Record player', playerTitle: 'Now on the turntable', pen: 'Notebook & pen', penHint: 'Open the notebook to write', typeHint: 'Click the typewriter to begin' },
    wxSound: { rainy: 'Rain sound', sunny: 'Forest sound' },
    wxName: { rainy: 'Rainy', sunny: 'After rain' },
  },

  // A table by the sea. There is no typewriter here: the typed page is a
  // sheet laid flat on the table, and the notebook opens whichever way of
  // writing is chosen.
  cafe: {
    id: 'cafe', name: 'Seaside café', blurb: 'Waves, gulls and a table in the sun',
    tagline: 'A table by the sea, with the waves coming in below.',
    img: 'assets/cafe.jpg',
    typewriter: false, quietKeys: true,
    paper: { x: 675, w: 322, platen: 700, min: 402, max: 402 },
    typeRect: { x: 615, y: 268, w: 442, h: 462 },
    deskCam: [845, 790],
    keys: null,
    weathers: ['sunny', 'dusk', 'rainy'],
    wx: {
      x: 700, y: 0, w: 972, h: 570, alpha: 3.6, tint: [240, 246, 252], lw: 1.3, len: 2, drips: 0, drops: false,
      panes: [   // open air beyond the awning
        { x0: 60, x1: 225, y0: 172, y1: 560, wgt: 0.14 },
        { x0: 225, x1: 972, y0: 168, y0b: 76, y1: 556, wgt: 0.86 },
      ],
    },
    steam: [55, 190, 1.6, 1.3, 1.2],
    curtains: false, arm: false, dim: 0.16, day: 0,
    labels: { lamp: 'Candle', window: 'Sea & weather', player: 'Café music', playerTitle: 'Playing in the café', pen: 'Notebook', penHint: 'Open the notebook to write', typeHint: 'Open the notebook to type' },
    wxSound: { sunny: 'Sea sound', dusk: 'Sea sound', rainy: 'Sea & rain sound' },
    wxName: { sunny: 'Sunny', dusk: 'Sunset', rainy: 'Rainy' },
  },

  // A reading room in the afternoon: tall windows on the left, a green
  // banker's lamp on the right, and a clock on the end of the shelves.
  library: {
    id: 'library', name: 'Old library', blurb: 'Tall windows, turning pages, a ticking clock',
    tagline: 'A quiet afternoon in an old library, with the sun coming through tall windows.',
    img: 'assets/library.jpg',
    paper: { x: 664, w: 370, platen: 522, min: 157, max: 420 },
    typeRect: { x: 560, y: 330, w: 566, h: 450 },
    deskCam: [1420, 725],
    keys: {
      w: 25, h: 13,
      rows: rows([
        ['1234567890', [696, 728, 758.3, 788.3, 818.7, 847.7, 877.3, 905.7, 933, 960.3], 632],
        ['qwertyuiop', [706.3, 737.7, 768.3, 798.7, 828.7, 859, 889.3, 919, 947, 975.3], 655],
        ['asdfghjkl;', [711.7, 744, 775.7, 806.7, 837.3, 868, 899, 929.7, 959.7, 989.3], 677],
        ['zxcvbnm,./', [724.7, 758, 789.3, 820, 851.7, 883.3, 914.3, 945.3, 975.3, 1006.3], 699],
      ]),
      extra: {
        shiftL: [677.7, 699, 36], shiftR: [1045, 699, 36], space: [862.5, 727, 262],
        '-': [989.3, 632, 25], '=': '-', '[': [1006.7, 655, 25], ']': '[', '\\': '[', "'": [1020, 677, 25], '`': '1',
        enter: [1020, 677, 25], delete: [989.3, 632, 25], tab: 'q',
      },
    },
    weathers: ['sunny', 'rainy'],
    wx: {
      x: 0, y: 0, w: 530, h: 390, alpha: 1.6, tint: [236, 240, 244], lw: 0.9, len: 1.4, drips: 0,
      panes: [   // the tall windows, with sills above the readers' heads
        { x0: 35, x1: 145, y1: 360, wgt: 0.3 }, { x0: 202, x1: 322, y1: 332, wgt: 0.3 },
        { x0: 352, x1: 440, y0: 18, y1: 368, wgt: 0.24 }, { x0: 462, x1: 524, y0: 34, y1: 340, wgt: 0.16 },
      ],
    },
    steam: [55, 190, 1.4, 1.2, 1.2],
    curtains: false, arm: false, dim: 0.3, day: 0,
    labels: { lamp: 'Reading lamp', window: 'Windows & weather', player: 'Music', playerTitle: 'Playing softly in the hall', pen: 'Notebook & pen', penHint: 'Open the notebook to write', typeHint: 'Click the typewriter to begin' },
    wxSound: { sunny: 'Outdoor sound', rainy: 'Rain sound' },
    wxName: { sunny: 'Sunny', rainy: 'Rainy' },
  },
};

// The reading room. There is no desk here: the open book on your lap shows
// the piece you are working on, set as a book, and the hourglass on the table
// keeps a forty-minute reading time.
PLACES.reading = {
  id: 'reading', name: 'Fireside', blurb: 'A book on your lap, the fire lit, snow outside',
  tagline: 'A book on your lap by the fire, with snow falling outside.',
  img: 'assets/reading.jpg',
  reader: true, typewriter: false, quietKeys: true,
  paper: { x: 675, w: 322, platen: 700, min: 402, max: 402 },   // not shown here
  typeRect: { x: 600, y: 690, w: 660, h: 251 },
  readRect: { x: 590, y: 668, w: 690, h: 273 },                   // the open book
  // on a phone held upright there is room for one page at a time
  readPages: { L: { x: 640, y: 700, w: 285, h: 241 }, R: { x: 936, y: 712, w: 290, h: 229 } },
  deskCam: [920, 820],
  keys: null,
  weathers: ['snowy', 'sunny'],
  wx: {
    x: 150, y: 0, w: 320, h: 340, alpha: 1, tint: [230, 236, 246], lw: 1, len: 1, drips: 0,
    panes: [{ x0: 6, x1: 150, y1: 322, wgt: 0.48 }, { x0: 156, x1: 316, y1: 322, wgt: 0.52 }],
  },
  steam: [55, 190, 1.5, 1.2, 1.2],
  curtains: false, arm: false, dim: 0.34, day: 0,
  labels: { lamp: 'Table lamp', window: 'Window & snow', player: 'Music', playerTitle: 'Playing by the fire', pen: 'Book', penHint: 'Click the book to read', typeHint: 'Click the book to read' },
  wxSound: { snowy: 'Wind sound', sunny: 'Outdoor sound' },
  wxName: { snowy: 'Snowing', sunny: 'Still night' },
};

export const PLACE_ORDER = ['study', 'cabin', 'cafe', 'library', 'reading'];
export const placeOf = (id) => PLACES[id] || PLACES.study;
