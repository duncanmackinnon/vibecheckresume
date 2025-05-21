module.exports = {
  // Creates a canvas element using the browser's native API.
  createCanvas: function () {
    return document.createElement('canvas');
  },
  // Loads an image using the browser's native Image API.
  loadImage: function (src) {
    const img = new Image();
    img.src = src;
    return img;
  }
};