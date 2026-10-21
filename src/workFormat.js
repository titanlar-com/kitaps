// Most catalog works are books. A few recommended readings are journal articles
// or essays: they are listed like books, but they have no edition or cover, and
// their page names where they appeared and links to the text.
export const WORK_FORMATS={
 article:{label:'Makale',schema:'ScholarlyArticle'},
 essay:{label:'Deneme',schema:'Article'},
};

export const workFormat=book=>WORK_FORMATS[book?.format]||null;

/** Where an article appeared, e.g. "Policy Sciences · 4 (2) · s. 155–169". */
export function publicationLine(publication){
 if(!publication)return '';
 const issue=[publication.volume,publication.issue&&`(${publication.issue})`].filter(Boolean).join(' ');
 return [publication.venue,issue,publication.pages&&`s. ${publication.pages}`].filter(Boolean).join(' · ');
}

/** What the publication link opens, named the same on every page. */
export function publicationLinkLabel(publication){
 if(publication?.readUrl)return 'Metni oku';
 return publication?.doi?'DOI kaydını aç':'Yayın sayfasını aç';
}

/** The text itself when it is free to read, otherwise its DOI record or the
 * outlet's own page for it. */
export function publicationUrl(publication){
 if(publication?.readUrl)return publication.readUrl;
 if(publication?.doi)return `https://doi.org/${publication.doi}`;
 return publication?.pageUrl||'';
}
