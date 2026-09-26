// Protobuf encoder for Antigravity trajectorySummaries
function encodeVarint(val) {
    const bytes = [];
    let v = BigInt(val);
    while (v > 0x7Fn) {
        bytes.push(Number((v & 0x7Fn) | 0x80n));
        v >>= 7n;
    }
    bytes.push(Number(v & 0x7Fn));
    return Buffer.from(bytes);
}

function encodeField(fieldNum, wireType, data) {
    const tag = (fieldNum << 3) | wireType;
    const tagBytes = encodeVarint(tag);
    if (wireType === 0) {
        return Buffer.concat([tagBytes, encodeVarint(data)]);
    } else if (wireType === 2) {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, typeof data === 'string' ? 'utf8' : undefined);
        const lenBytes = encodeVarint(buf.length);
        return Buffer.concat([tagBytes, lenBytes, buf]);
    }
    throw new Error('Unsupported wire type: ' + wireType);
}

function buildEntryChunk(info) {
    const mtime = info.mtime;
    const sec = Math.floor(mtime);
    const nanos = Math.floor((mtime - sec) * 1e9);
    const tsBytes = Buffer.concat([
        encodeField(1, 0, sec),
        encodeField(2, 0, nanos)
    ]);

    let wsBytes = Buffer.alloc(0);
    if (info.wsPath) {
        wsBytes = Buffer.concat([
            encodeField(1, 2, info.wsPath),
            encodeField(3, 2, Buffer.alloc(0))
        ]);
    }

    const innerFields = [
        encodeField(1, 2, info.title),
        encodeField(2, 0, info.stepCount),
        encodeField(3, 2, tsBytes),
        encodeField(4, 2, info.trajId),
        encodeField(5, 0, 1),
        encodeField(7, 2, tsBytes),
        wsBytes.length > 0 ? encodeField(9, 2, wsBytes) : Buffer.alloc(0),
        encodeField(10, 2, tsBytes),
        encodeField(15, 2, Buffer.alloc(0)),
        encodeField(16, 0, 4),
        info.rawMetaBlob ? encodeField(17, 2, info.rawMetaBlob) : Buffer.alloc(0),
        encodeField(22, 0, 4)
    ];

    const inner = Buffer.concat(innerFields);
    const b64Inner = Buffer.from(inner.toString('base64'), 'utf8');
    const f2Inner = encodeField(1, 2, b64Inner);
    const chunk = Buffer.concat([
        encodeField(1, 2, info.cid),
        encodeField(2, 2, f2Inner)
    ]);
    return encodeField(1, 2, chunk);
}

function encodeTrajectorySummaries(conversations) {
    const chunks = conversations.map(buildEntryChunk);
    const totalPayload = Buffer.concat(chunks);
    return totalPayload.toString('base64');
}

module.exports = {
    encodeVarint,
    encodeField,
    buildEntryChunk,
    encodeTrajectorySummaries
};
