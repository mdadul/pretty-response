export function toJsonPath(pathSegments: (string | number)[]): string {
  return pathSegments.reduce<string>((acc, segment, index) => {
    const segmentStr = String(segment);

    if (!Number.isNaN(Number(segmentStr)) && segmentStr.trim() !== "" && Number.isInteger(Number(segmentStr))) {
      // Numeric index (array)
      return acc + `[${Number(segmentStr)}]`;
    }

    if (index === 0 && segmentStr === "$") {
      return "$";
    }

    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(segmentStr)) {
      // Simple identifier (no quoting needed)
      return acc + (acc ? "." : "") + segmentStr;
    }

    const escaped = segmentStr.replace(/"/g, '\\"');
    return `${acc}["${escaped}"]`;
  }, "");
}

export function parseJsonPath(path: string): (string | number)[] | null {
  if (!path || path[0] !== "$") return null;
  const segments: (string | number)[] = ["$"];
  let i = 1;

  const len = path.length;

  while (i < len) {
    const ch = path[i];

    if (ch === ".") {
      i++;
      // identifier
      let ident = "";
      while (i < len && /[a-zA-Z0-9_]/.test(path[i])) {
        ident += path[i];
        i++;
      }
      if (!ident) return null;
      segments.push(ident);
      continue;
    }

    if (ch === "[") {
      i++;
      if (i >= len) return null;

      if (path[i] === '"') {
        // quoted key
        i++;
        let key = "";
        while (i < len) {
          const c = path[i];
          if (c === "\\") {
            const next = path[i + 1];
            if (next === '"' || next === "\\") {
              key += next;
              i += 2;
              continue;
            }
          }
          if (c === '"') break;
          key += c;
          i++;
        }
        if (path[i] !== '"') return null;
        i++; // closing quote
        if (path[i] !== "]") return null;
        i++; // closing ]
        segments.push(key);
      } else {
        // numeric index
        let numStr = "";
        while (i < len && /[0-9]/.test(path[i])) {
          numStr += path[i];
          i++;
        }
        if (!numStr || path[i] !== "]") return null;
        i++; // ]
        segments.push(Number(numStr));
      }
      continue;
    }

    // Unexpected character
    return null;
  }

  return segments;
}

