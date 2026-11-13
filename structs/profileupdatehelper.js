function buildTargetedProfileSet(profileId, profile, changes) {
  const base = `profiles.${profileId}`;
  const set = {
    [`${base}.rvn`]: profile.rvn,
    [`${base}.commandRevision`]: profile.commandRevision,
    [`${base}.updated`]: profile.updated,
  };

  for (const change of changes) {
    switch (change.changeType) {
      case "statModified":
        set[`${base}.stats.attributes.${change.name}`] = change.value;
        break;

      case "itemAttrChanged":
        set[`${base}.items.${change.itemId}.attributes.${change.attributeName}`] =
          change.attributeValue;
        break;

      case "itemAdded":
        set[`${base}.items.${change.itemId}`] = change.item;
        break;

      case "itemQuantityChanged":
        set[`${base}.items.${change.itemId}.quantity`] = change.quantity;
        break;
      default:
        break;
    }
  }

  return set;
}

module.exports = { buildTargetedProfileSet };