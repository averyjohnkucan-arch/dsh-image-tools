const actions = {photo:'generate_photograph',art:'generate_art',edit:'edit_image'};

const artStyle = /\b(?:illustration|illustrated|watercolou?r|oil painting|acrylic painting|gouache|ink drawing|line art|line drawing|pencil sketch|charcoal drawing|woodcut|linocut|screen print|pixel art|vector art|comic(?: book)?|manga|anime|concept art|collage|stylized|stylised|poster art|cel-shaded)\b/iu;
const realisticStyle = /\b(?:photo(?:graph|realistic)?|photography|photorealism|realistic photo|film still|documentary still|studio photograph|camera RAW)\b/iu;
const photographOfArt = /^\s*(?:make |generate |create )?(?:me )?(?:an? )?(?:(?:studio|realistic|detailed|high-resolution|wide-angle) )*(?:photo|photograph) of\b/iu;
const editReference = /\b(?:attached|uploaded|previous|original|reference|this|that|same) (?:image|photo|photograph|picture|portrait|drawing)\b/iu;
const editCommand = /(?:^|[.!?]\s+)(?:please\s+)?(?:edit|retouch|restore|crop|recolou?r|inpaint|outpaint|colorize)\b|\b(?:change|turn|make|keep|rework) (?:it|this|that|the image|the photo)\b|\b(?:remove|replace|blur) (?:the|its) background\b/iu;
const newImage = /\b(?:start from scratch|from scratch|new image without (?:a |the )?reference)\b/iu;

function containsImage(value) {
  if (!value || typeof value !== 'object') return false;
  if (value.type === 'image' && value.attachment?.attachmentId) return true;
  return Object.values(value).some(containsImage);
}

export function routeImage({prompt, mode = 'auto', image_ids}, recentEvents = () => []) {
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 12000) {
    throw Error('Describe the image with 1–12,000 characters.');
  }
  if (mode !== 'auto' && !Object.hasOwn(actions,mode)) throw Error('Choose auto, photo, art, or edit.');
  if (image_ids?.length) {
    if (mode !== 'auto' && mode !== 'edit') {
      return {question:'Should I edit the selected images, or create a new image from text?'};
    }
    return {action:actions.edit};
  }
  if (mode !== 'auto') return {action:actions[mode]};

  if (!newImage.test(prompt)) {
    if (editReference.test(prompt) || editCommand.test(prompt)) return {action:actions.edit};
    const latestUser = recentEvents().findLast(event => event.type === 'user/message');
    if (containsImage(latestUser?.data)) {
      return {question:'Should I use the attached image as a reference, or create a new image from text?'};
    }
  }
  if (photographOfArt.test(prompt)) return {action:actions.photo};
  const art = artStyle.test(prompt);
  if (art && realisticStyle.test(prompt)) {
    return {question:'Should the result look like a photograph or a stylized illustration?'};
  }
  return {action:art ? actions.art : actions.photo};
}
