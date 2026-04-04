export const extractTextFromHtml = (html: string) => {
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let content = mainMatch?.[1] ?? articleMatch?.[1] ?? bodyMatch?.[1] ?? html;

  content = content.replace(/<script[\s\S]*?<\/script>/gi, '');
  content = content.replace(/<style[\s\S]*?<\/style>/gi, '');
  content = content.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  content = content.replace(/<footer[\s\S]*?<\/footer>/gi, '');
  content = content.replace(/<header[\s\S]*?<\/header>/gi, '');
  content = content.replace(/<aside[\s\S]*?<\/aside>/gi, '');

  content = content.replace(/<li[^>]*>/gi, '\n- ');
  content = content.replace(/<\/li>/gi, '\n');
  content = content.replace(
    /<(br|p|div|section|article|h[1-6]|tr|td|ul|ol)[^>]*>/gi,
    '\n',
  );
  content = content.replace(
    /<\/(p|div|section|article|tr|td|ul|ol)[^>]*>/gi,
    '\n',
  );

  const text = content.replace(/<[^>]+>/g, '');

  return decodeHtmlEntities(text)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .filter((line, index, array) => line !== array[index - 1])
    .join('\n');
};

export const decodeHtmlEntities = (input: string) => {
  const basicMap: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
  };

  let output = input.replace(
    /&(nbsp|amp|lt|gt|quot|#39);/g,
    (match) => basicMap[match] ?? match,
  );

  output = output.replace(/&#(\d+);/g, (_, code) => {
    const value = Number(code);
    if (Number.isNaN(value)) return _;
    return String.fromCharCode(value);
  });

  return output;
};
