var fs = require("fs");
var json = fs.readFileSync("public/data/us.json", "utf8");

console.log("Read: ", json.length);

var arcs = JSON.parse(json).objects;

console.log("arcs: ", JSON.stringify(arcs));

