// Popo — the 24 playable animals (Kenney Cube Pets). Shared by the server (require) and the browser (window.ANIMALS).
// The index is the animal code sent over the network (lobby avatar `av`, hide & seek `skin`). Never reorder.
(function (root) {
  const ANIMALS = [
    { id: 'pig', name: 'Piggy' }, { id: 'bunny', name: 'Bunny' }, { id: 'fox', name: 'Fox' }, { id: 'cow', name: 'Cow' },
    { id: 'chick', name: 'Chick' }, { id: 'cat', name: 'Kitty' }, { id: 'dog', name: 'Puppy' }, { id: 'penguin', name: 'Penguin' },
    { id: 'polar', name: 'Polar Bear' }, { id: 'panda', name: 'Panda' }, { id: 'koala', name: 'Koala' }, { id: 'crab', name: 'Crab' },
    { id: 'parrot', name: 'Parrot' }, { id: 'monkey', name: 'Monkey' }, { id: 'lion', name: 'Lion' }, { id: 'tiger', name: 'Tiger' },
    { id: 'elephant', name: 'Elephant' }, { id: 'giraffe', name: 'Giraffe' }, { id: 'deer', name: 'Deer' }, { id: 'hog', name: 'Boar' },
    { id: 'beaver', name: 'Beaver' }, { id: 'bee', name: 'Bee' }, { id: 'caterpillar', name: 'Caterpillar' }, { id: 'fish', name: 'Fishy' },
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = { ANIMALS };
  else root.ANIMALS = ANIMALS;
})(typeof window !== 'undefined' ? window : this);
