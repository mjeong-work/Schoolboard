const ADJECTIVES = [
  'Happy', 'Sleepy', 'Tiny', 'Lucky', 'Sunny', 'Brave', 'Cozy', 'Silly',
  'Gentle', 'Clever', 'Fuzzy', 'Bouncy', 'Fluffy', 'Peppy', 'Grumpy',
  'Snappy', 'Breezy', 'Jolly', 'Misty', 'Zesty',
];

const ANIMALS = [
  'Whale', 'Panda', 'Otter', 'Fox', 'Bunny', 'Turtle', 'Penguin', 'Cloud',
  'Star', 'Koala', 'Hedgehog', 'Capybara', 'Raccoon', 'Meerkat', 'Alpaca',
  'Narwhal', 'Axolotl', 'Quokka', 'Blobfish', 'Corgi',
];

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getAnonymousName(id: string): string {
  const h1 = hashCode(id);
  const h2 = hashCode(id + '\x01');
  return `${ADJECTIVES[h1 % ADJECTIVES.length]} ${ANIMALS[h2 % ANIMALS.length]}`;
}

const AVATAR_COLORS = [
  '#7B9FD4', // soft blue
  '#8FC49A', // soft green
  '#C490BD', // soft purple
  '#E8A87C', // soft orange
  '#85C1C1', // soft teal
  '#E88E8E', // soft rose
  '#A8B4D4', // periwinkle
  '#9DC48C', // sage green
  '#D4A5B0', // dusty rose
  '#B8A4D4', // lavender
  '#D4C085', // warm yellow
  '#82C4B4', // seafoam
];

export function getAvatarColor(id: string): string {
  return AVATAR_COLORS[hashCode(id) % AVATAR_COLORS.length];
}
