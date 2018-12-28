
// TODO refactor to use es6.js


function logBytes(bytes) {
  let str = "";

  for (let i=0; i < bytes.length; i++) {
    if (i % 8 === 0) {
      str += "\n\n" + (i + 1) + ")\t";
    } 

    const byte = bytes[i];

    str += byte & 0b1;
    str += byte & 0b10;
    str += byte & 0b100;
    str += byte & 0b1000;

    str += " ";

    str += byte & 0b10000;
    str += byte & 0b100000;
    str += byte & 0b1000000;
    str += byte & 0b10000000;

    str += "   ";
  }

}

/** Writes the given destAddrWord and lengthOrPtable into the given 
 * DataView at the given address.
 */
function writePtr(dv, byteAddr, destWordAddr, lengthOrPtable) {
  dv.setUint32(byteAddr, destWordAddr, true);
  dv.setUint32(byteAddr + 4, lengthOrPtable, true); 
}

// function writeRec(dv, byteAddr, destWordAddr, fieldWriters) {
//   writePtr(dv, byteAddr, destWordAddr);

//   var destByteAddr = destWordAddr * 8;

//   destWordAddr += fieldWriters.length; // Advance past this record's fields
 
//   for (var i=0; i < fieldWriters.length; i++) {
//     var writeField = fieldWriters[i];

//     destWordAddr = writeField(dv, destByteAddr + (i * 8), destWordAddr);
//   }

//   return destWordAddr;
// }


function decode(bytes) {
  var dv = new DataView(bytes);
  var release = dv.getUint32(0, true);
  var variantType = dv.getUint16(4, true);

  switch (variantType) {
    case 0x1: // Topology
      var ptable = dv.getUint16(6, true);

      return decodeTopology(dv, 8, ptable);
  }

  decodingError(bytes, "I couldn't decode this unknown variant type: " + variantType);
}

function decodeTopology(dv, addr, ptable) {
  // TODO check if ptable is missing any required entries
  
  return {
    type: "Topology",
    objects: decodeObjects(dv, addr),
    // arcs: decodeArcs(dv, addr + 8),
    // transform: decodeTransform(dv, addr + 16)
  };
}

function decodeObjects(dv, addr) {
  var destAddr = dv.getUint32(addr, true) * 8;
  var ptable = dv.getUint32(addr + 4, true);

  // TODO check if ptable is missing any required entries
  
  return {
    counties: decodeGeometryCollection(dv, destAddr),
    states: decodeGeometryCollection(dv, destAddr + 8),
    // land: decodeGeometry(dv, (objAdder + 2) * 8)
  };
}

function decodeTransform(dv, addr) {
  var ptrAddr = dv.getUint32(addr, true);
  var ptable = dv.getUint32(addr + 4, true);

  // TODO check if ptable is missing any required entries
  
  return {
    scale: [
      dv.getFloat64(ptrAddr * 8, true),
      dv.getFloat64((ptrAddr + 1) * 8, true),
    ],
    transform: [
      dv.getFloat64((ptrAddr + 2) * 8, true),
      dv.getFloat64((ptrAddr + 3) * 8, true),
    ]
  };
}

function decodeGeometryCollection(dv, addr) {
  var ptrAddr = dv.getUint32(addr, true);
  var ptable = dv.getUint32(addr + 4, true);

  if (ptable & 0x1 !== 0x1) {
    decodingError("Missing required field \"geometries\"");
  }

  var result = {
    geometries: decodeGeometries(dv, ptrAddr)
  };

  if (ptable & 0x10 === 0x10) {
    // BBox is present.
    result.bbox = decodeBBox(dv, (ptrAddr + 1) * 8);
  }

  return result;
}

function decodeGeometries(dv, addr) {
  return [];
}

function decodeBBox(dv, addr) {
  var ptrAddr = dv.getUint32(addr, true);
  var ptable = dv.getUint32(addr + 4, true);

  // TODO check if ptable is missing any required entries
  
  return [
    dv.getFloat32(ptrAddr * 8, true),
    dv.getFloat32((ptrAddr + 1) * 8, true),
    dv.getFloat32((ptrAddr + 2) * 8, true),
    dv.getFloat32((ptrAddr + 3) * 8, true),
  ];
}


function decodeArcs(dv, addr) {
  var arcsAddr = dv.getUint32(addr, true);
  var arcsLength = dv.getUint32(addr + 4, true);
  
  if (arcsLength === 0) {
    if (arcsAddr === 0) {
      // empty collection; nothing to look up!
      return [];
    }

    throw "TODO handle superlong pointers.";
  } else {
    // Since length > 0 && address > 0, this is a normal pointer - look it up!
    var arcs = new Array(arcsLength);

    for (var i=0; i < arcsLength; i++) {
      arcs[i] = decodeInt32Array(dv, (arcsAddr + i) * 8);
    }

    return arcs;
  }
}

function decodeInt32Array(dv, addr) {
  var intsAddr = dv.getUint32(addr, true);
  var intsLength = dv.getUint32(addr + 4, true);
  
  if (intsLength === 0) {
    if (intsAddr === 0) {
      // empty collection; nothing to look up!
      return [];
    }

    throw "TODO handle superlong pointers.";
  } else {
    // Since length > 0 && address > 0, this is a normal pointer - look it up!
    var ints = new Array(intsLength);

    for (var i=0; i < intsLength; i++) {
      ints[i] = dv.getInt32((intsAddr + i) * 8, true);
    }

    return ints;
  }
}

function encode(data) {
  var bytes = new ArrayBuffer(20000); // TODO dynamic allocation
  var dv = new DataView(bytes);
  
  switch (data.type) {
    case "Topology":
      dv.setUint32(0, 1, true); // This is Release #1
      dv.setUint16(4, 0x1, true); // 0x1 is the "Topology" variant
      dv.setUint16(6, 0x111, true); // The "Topoloy" variant holds a record; this is its ptable
      
      encodeTopology(dv, 8, 2, data.objects, data.arcs, data.transform);

      return dv.buffer;
  }

  encodingError(data, "I couldn't encode this unknown variant type: " + data.type);
}

function encodeGeometryCollection(dv, byteAddr, destWordAddr, geometries, bbox) {
  var ptable = bbox == null ? 0x01 : 0x11;
  writePtr(dv, byteAddr, destWordAddr, ptable);

  var destByteAddr = destWordAddr * 8;

  destWordAddr += 1; // Advance past this GeometryCollection record's 1 required field

  if (bbox != null) {
    destWordAddr += 1; // Advance past this GeometryCollection record's 1 optional field which happened to be present
  }
 
  destWordAddr = encodeGeometries(dv, destByteAddr, destWordAddr, geometries); 

  if (bbox != null) {
    destWordAddr = encodeBBox(dv, destByteAddr + 8, destWordAddr, bbox); 
  }

  return destWordAddr;
}


function encodeGeometries(dv, addr, nextAddr, geometries) {
  return nextAddr;
}


function encodeTopology(dv, destWordAddr, objects, arcs, transform) {
  var destByteAddr = destWordAddr * 8;

  destWordAddr += 3; // Advance past this Topology record's 3 fields
 
  destWordAddr = encodeObjects(  dv, destByteAddr,      destWordAddr, objects); 
  destWordAddr = encodeArcs(     dv, destByteAddr + 8,  destWordAddr, arcs);
  destWordAddr = encodeTransform(dv, destByteAddr + 16, destWordAddr, transform);

  return destWordAddr;
}

function encodeObjects(dv, addr, nextAddr, objects) {
  dv.setUint32(addr, nextAddr, true);
  dv.setUint32(addr + 3, 0x111, true); // presence table for Objects record

  var fieldAddr = nextAddr * 8;

  // Advance past Objects record's 3 fields
  nextAddr += 3;

  nextAddr = encodeGeometryCollection(dv, fieldAddr,      nextAddr, objects.counties); 
  nextAddr = encodeGeometryCollection(dv, fieldAddr + 8,  nextAddr, objects.states);
  // nextAddr = encodeGeometry(          dv, fieldAddr + 16, nextAddr, objects.land);

  return nextAddr + 3;
}

function encodeTransform(dv, addr, nextAddr, transform) {
  dv.setUint32(addr, nextAddr, true);
  dv.setUint32(addr + 4, 0x1111, true); // presence table for Transform record

  dv.setFloat64(nextAddr++ * 8, transform.scale[0], true);
  dv.setFloat64(nextAddr++ * 8, transform.scale[1], true);
  dv.setFloat64(nextAddr++ * 8, transform.translate[0], true);
  dv.setFloat64(nextAddr++ * 8, transform.translate[1], true);
 
  return nextAddr;
}

function encodeBBox(dv, byteAddr, destWordAddr, bbox) {
  writePtr(dv, byteAddr, destWordAddr, 0x1111);

  dv.setFloat32(destWordAddr++ * 8, bbox[0], true);
  dv.setFloat32(destWordAddr++ * 8, bbox[1], true);
  dv.setFloat32(destWordAddr++ * 8, bbox[2], true);
  dv.setFloat32(destWordAddr++ * 8, bbox[3], true);
 
  return destWordAddr;
}

function encodeArcs(dv, addr, nextAddr, arcs) {
  // Leave it at all 0s if it's an empty collection.
  if (arcs.length === 0) {
    return nextAddr;
  } 

  dv.setUint32(addr, nextAddr, true);
  dv.setUint32(addr + 4, arcs.length, true);

  var nextArcAddr = nextAddr + arcs.length; // Advance past the array elements

  for (var i=0; i < arcs.length; i++) {
    nextArcAddr = encodeInt32Array(dv, (nextAddr++ * 8), nextArcAddr, arcs[i]);
  }

  return nextArcAddr;
}

function encodeInt32Array(dv, addr, nextAddr, ints) {
  // Leave it at all 0s if it's an empty collection.
  if (ints.length !== 0) {
    dv.setUint32(addr, nextAddr, true);
    dv.setUint32(addr + 4, ints.length, true);

    for (var i=0; i < ints.length; i++) {
      dv.setUint32((nextAddr++ * 8), ints[i], true);
    }
  }

  return nextAddr;
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

// TODO read this from us.json
var rawData = {
  type: "Topology",
  objects: {
    counties: {bbox: [0.1, 0.2, 0.3, 0.5], geometries: []},
    states: {geometries: []}
    // land: ...
  },
  arcs: [[1], [2, 3], [44, 55, 66], [], [77]],
  transform: {scale: [ 5, 6 ], translate: [ 7.2, 8.3 ]}
};

verify(rawData);
