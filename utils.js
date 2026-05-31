function stripHtmlTags(str) {
  if (!str) return '';
  return str.replace(/<[^>]*>?/gm, '').trim();
}

function formatDateToISO(dateString) {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return '';
    }
    return date.toISOString();
  } catch (err) {
    return '';
  }
}

module.exports = {
  stripHtmlTags,
  formatDateToISO
};
