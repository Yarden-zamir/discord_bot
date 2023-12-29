function getRandomColor(seedString) {
  var hash = 0;
  for (var i = 0; i < seedString.length; i++) {
    hash = seedString.charCodeAt(i) + ((hash << 5) - hash);
  }

  var hex = "0x";
  for (var i = 0; i < 6; i++) {
    var value = (hash >> (i * 4)) & 0xf;
    hex += value.toString(16);
  }
  return hex;
}

module.exports = { getRandomColor };