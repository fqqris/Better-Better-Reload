const _indexCache = new Map(); 

function getItemIdByTemplateId(accountId, profile, templateId) {
  if (!templateId) return "";

  const itemKeys = Object.keys(profile.items || {});
  const cached = _indexCache.get(accountId);

  let index;
  if (cached && cached.itemCount === itemKeys.length) {
    index = cached.index;
  } else {
    index = new Map();
    for (const itemId of itemKeys) {
      index.set(profile.items[itemId].templateId.toLowerCase(), itemId);
    }
    _indexCache.set(accountId, { itemCount: itemKeys.length, index });
  }

  return index.get(templateId.toLowerCase()) || "";
}

function invalidateItemIndex(accountId) {
  _indexCache.delete(accountId);
}

module.exports = { getItemIdByTemplateId, invalidateItemIndex };