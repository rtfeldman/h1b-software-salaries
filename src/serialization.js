

function decode(bytes) {
  var dv = new DataView(bytes);
  var release = dv.getUint32(0, true);
  var variantType = dv.getUint16(4, true);

  switch (variantType) {
    case 0x1: // Topology
      return decodeTopology(8, dv);
  }

  decodingError(bytes, "I couldn't decode this unknown variant type: " + variantType);
}

function decodeTopology(address, dv) {
  return {
    type: "Topology",
    objects: dv.getFloat64(address, true), // objects is a float64
    arcs: dv.getFloat64(address + 8, true), // arcs is a float64
    transform: dv.getFloat64(address + 16, true) // transform is a float64
  };
}

function encode(data) {
  var bytes = new ArrayBuffer(1024 * 1024); // TODO dynamic allocation
  var dv = new DataView(bytes);
  
  switch (data.type) {
    case "Topology":
      dv.setUint32(0, 1, true); // This is Release #1
      dv.setUint16(4, 0x1, true); // 0x1 is the "Topology" variant
      dv.setUint16(6, 3, true); // Word length of the "Topoloy" variant is 3 (an inlined record)
      
      encodeTopology(dv, 8, data.objects, data.arcs, data.transform);

      return dv.buffer;
  }

  encodingError(data, "I couldn't encode this unknown variant type: " + data.type);
}

function encodeTopology(dv, address, objects, arcs, transform) {
  dv.setFloat64(address, objects, true); // objects is a float64
  dv.setFloat64(address + 8, arcs, true); // arcs is a float64
  dv.setFloat64(address + 16, transform, true); // transform is a float64
}

function encodingError(data, msg) {
  throw msg;
}

function decodingError(data, msg) {
  throw msg;
}

function verify(data) {
  // TODO time this step
  var jsonEncoded = JSON.stringify(data);

  // TODO time this step
  var binaryEncoded = encode(data);

  // TODO time this step
  var decoded = decode(binaryEncoded);

  // TODO time this step
  var jsonDecoded = JSON.parse(jsonEncoded);

  if (JSON.stringify(decoded) === jsonEncoded) {
    console.log("Success!");
    console.log("binary data size:", binaryEncoded.byteLength);
    console.log("JSON string size:", JSON.stringify(jsonDecoded).length);
    return true;
  } else {
    console.log("Failed! Expected:\n\n", jsonEncoded, "\n\n", "but got:\n\n", JSON.stringify(decoded), "\n\n");

    return false;
  }
}

verify({
  type: "Topology",
  objects: 1.2,
  arcs: 3.4,
  transform: 5.6
});
