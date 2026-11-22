# Research: Locations Cross-Check Against MoFAGA

Part of the [research digests](README.md) (digest name `locations_mofaga_cross_check`). Compiled on 2026-11-22 for [VX-10](../risks-and-open-decisions.md#31-register). This is a dated snapshot of a comparison, not a dataset: [04 §21.4](../04-domain-model-and-data-dictionary.md#214-locations-dataset-vx-10) owns the locations dataset and what was changed.

**What this is.** VX-10 asks for a name-by-name check of the seeded locations against the local-government directory of the Ministry of Federal Affairs and General Administration (MoFAGA). The ministry's site refused or dropped connections from the build session on 2026-11-22, so the check read the Internet Archive's copies of the directory pages instead. Every fact below is `[verified-official]` in the sense of the [status tags](README.md#status-tags), read from those archived copies of the official pages: 102 page snapshots made between 2026-01-12 and 2026-10-05.

## Method

- **Pages.** The directory has one paginated list per province and type, at `https://mofaga.gov.np/local-contact/<type>-prov-<n>`, with `<type>` one of `metro`, `sub-metro`, `mun` and `village-mun`, and whole-province lists for Madhesh, Bagmati and Lumbini (`prov-2`, `prov-3`, `prov-5`). Each row gives the province, the local level's Nepali name with its type word, and the district. For every page and page number, the latest snapshot from 2024 onwards was read, found through the Wayback CDX API (`url=mofaga.gov.np/local-contact/<page>*`, `from=2024`).
- **Coverage.** The pages were archived on different days, so their pagination had shifted between snapshots: 42 rows appear on two copied pages and 17 appear on none. No copy of Koshi's sub-metropolitan page exists in any year, so Dharan (`11301`) and Itahari (`11306`) are missing too. Madhesh's metropolitan city, Birgunj (`20807`), has no page of its own and comes from the whole-province list. After removing duplicates, the copies name 734 of the 753 local levels: 6 metropolitan, 9 sub-metropolitan, 272 municipalities and 447 rural municipalities.
- **Districts.** All 77 MoFAGA district names map to one district each; 7 differ from Nepal Post's only in spelling (for example काठमाण्डौं and काठमाडौँ, कपिलबस्तु and कपिलवस्तु).
- **Local levels.** Each MoFAGA name was compared with the seeded names of its district: first exactly, then after folding spelling conventions (ङ्ग and ङ, ं and ँ, ि and ी, ु and ू, ब and व, श, ष and स, ण्ड and न्ड, spaces and hyphens), then with the closest seeded name of the same type.

## Results

| Result                              | Local levels |
| ----------------------------------- | -----------: |
| Same name                           |          572 |
| Differs only in spelling convention |          118 |
| Differs otherwise                   |           44 |
| Not in the archived copies          |           19 |

No local level has a different type in the two sources. The English names, which come from the Central Bureau of Statistics and the Survey Department, are not part of the comparison: the directory is in Nepali.

The 19 local levels not in the copies: `10208`, `10507`, `10509`, `10703`, `11203`, `11301`, `11306`, `20511`, `30905`, `40107`, `40403`, `40503`, `60306`, `70103`, `70203`, `70210`, `70401`, `70404`, `70710`.

## What the 44 other differences are

**Clear typos in the Nepal Post text, corrected on 2026-11-22.** The product owner chose to correct only these ([risks §2.3](../risks-and-open-decisions.md#23-decision-log)); each is a `name_ne` row of `database/seeders/reference/data/locations_overrides.csv`, in MoFAGA's spelling.

| Code    | Nepal Post          | MoFAGA, now seeded   |
| ------- | ------------------- | -------------------- |
| `10107` | पाथिभरा याङ्वराक    | पाथिभरा याङ्वरक      |
| `20103` | अग्मीसयर कृष्ण सवरन | अग्नीसाइर कृष्णासवरन |
| `20204` | मिर्चेया            | मिर्चैया             |
| `30403` | गंङ्गा जमुना        | गङ्गाजमुना           |
| `30506` | म्यगङ               | म्यागङ               |
| `30601` | शंङ्खरापुर          | शंखरापुर             |
| `31107` | ध्याङलेख            | घ्याङलेख             |
| `40602` | मस्र्याङ्गदी        | मर्स्याङदी           |
| `50305` | स्वर्गद्धारी        | स्वर्गद्वारी         |
| `61002` | चिङ्गगाड            | चिङ्गाड              |
| `70606` | के.आई.सिं.          | के.आई.सिंह           |
| `70905` | चाँदनी-दोधारा       | दोधारा चाँदनी        |

`30403` falls among the spelling-convention rows, because folding ं and ँ hides its doubled nasal; it is corrected for the same reason as `30601`.

**Spelling conventions** that the folding above does not cover, such as ञ्ज and न्ज (`11311` देवानगन्ज, देवानगञ्ज), ं and a half nasal (`20116` कङ्कालिनी, कंकालिनी) and joined or hyphenated words (`20301` गणेशमान चारनाथ, गणेशमान–चारनाथ). Nepal Post's spelling is kept.

**Typos in MoFAGA's text**, where Nepal Post's spelling is kept: `20107` सुरुगां, `70207` छबिसपाथिभेरा, the type words उप-महानगरपालिका (all nine sub-metropolitan rows), `70204` गाँउपालिका and `60502` गाउँपलिका.

**Names where the sources split.** Nepal Post, the CBS list and the Survey Department agree with each other against MoFAGA. Nepal Post's spelling and the English name are kept:

- `30602` कागेश्वरी मनहरा (Kageshwori Manahara); MoFAGA कागेश्वरी–मनोहरा
- `70403` पुचौंडी (Puchaundi); MoFAGA पुर्चौडी
- `10108` सिरीजङ्गा (Sirijanga); MoFAGA सिरीजङ्घा
- `20711` आदर्श कोटवाल (Aadarsha Kotwal); MoFAGA आदर्श कोतवाल

**Possible renames, open under VX-10.** MoFAGA's name differs in words, not spelling. One source is either ahead of the others or behind them, and the copies do not say which:

- `31007` Doramba, दोरम्बा; MoFAGA दोरम्बा शैलुङ
- `60706` Bheri Malika, भेरीमालिका; MoFAGA भेरी
- `20315` Janakpurdham, जनकपुरधाम; MoFAGA जनकपुर (Nepal Post and the Survey Department have the newer name)
- `20801` Thori, ठोरी (सुवर्णपुर); MoFAGA ठोरी
