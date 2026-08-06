/* ==========================================================================
   firebase.js — Firestore REST data-access layer
   Business logic, collection name, and document IDs are UNCHANGED from the
   original single-file app. Only wrapped in a namespace for multi-file use.
   ========================================================================== */

(function () {
  "use strict";

  const PROJECT_ID = "fica-rating-ranking";
  const FS_BASE = "https://firestore.googleapis.com/v1/projects/" + PROJECT_ID + "/databases/(default)/documents";

  function toFsValue(v) {
    if (v === null || v === void 0) return { nullValue: null };
    if (typeof v === "string") return { stringValue: v };
    if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === "boolean") return { booleanValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsValue) } };
    if (typeof v === "object") {
      const fields = {};
      Object.keys(v).forEach((k) => {
        fields[k] = toFsValue(v[k]);
      });
      return { mapValue: { fields } };
    }
    return { stringValue: String(v) };
  }

  function fromFsValue(fv) {
    if (!fv) return null;
    if ("stringValue" in fv) return fv.stringValue;
    if ("integerValue" in fv) return parseInt(fv.integerValue, 10);
    if ("doubleValue" in fv) return fv.doubleValue;
    if ("booleanValue" in fv) return fv.booleanValue;
    if ("nullValue" in fv) return null;
    if ("arrayValue" in fv) return (fv.arrayValue.values || []).map(fromFsValue);
    if ("mapValue" in fv) {
      const out = {};
      const fields = fv.mapValue.fields || {};
      Object.keys(fields).forEach((k) => {
        out[k] = fromFsValue(fields[k]);
      });
      return out;
    }
    return null;
  }

  async function fsGetList(docId) {
    const res = await fetch(FS_BASE + "/carromRanks/" + docId);
    if (res.status === 404) return [];
    if (!res.ok) throw new Error("Firestore read failed (" + res.status + ")");
    const data = await res.json();
    const fields = data.fields || {};
    return fields.list ? fromFsValue(fields.list) : [];
  }

  async function fsSetList(docId, list) {
    const body = { fields: { list: toFsValue(list) } };
    const res = await fetch(FS_BASE + "/carromRanks/" + docId + "?updateMask.fieldPaths=list", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error("Firestore write failed (" + res.status + ")");
  }

  async function fsGetDoc(docId) {
    const res = await fetch(FS_BASE + "/carromRanks/" + docId);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("Firestore read failed (" + res.status + ")");
    const data = await res.json();
    if (!data.fields) return null;
    return fromFsValue({ mapValue: { fields: data.fields } });
  }

  async function fsSetDoc(docId, obj) {
    const body = { fields: {} };
    Object.keys(obj).forEach((k) => {
      body.fields[k] = toFsValue(obj[k]);
    });
    const res = await fetch(FS_BASE + "/carromRanks/" + docId, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error("Firestore write failed (" + res.status + ")");
  }

  window.FB = {
    PROJECT_ID,
    FS_BASE,
    toFsValue,
    fromFsValue,
    fsGetList,
    fsSetList,
    fsGetDoc,
    fsSetDoc
  };
})();
