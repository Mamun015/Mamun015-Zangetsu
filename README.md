# DhakaFlix for Zangetsu

Zangetsu-র জন্য অফিসিয়াল-বহির্ভূত সোর্স। BDIX ফাইল সার্ভার **DhakaFlix**
(`http://172.16.50.4/`) থেকে মুভি, সিরিজ আর অ্যানিমে সরাসরি ব্রাউজ করে চালায়।

> ⚠️ এই সোর্স শুধু কাজ করে যদি তুমি BDIX-সংযুক্ত ইন্টারনেট লাইনে থাকো।
> অন্য নেটওয়ার্কে সার্ভারটাই ধরা পড়ে না।

## ইনস্টল

1. Zangetsu অ্যাপ খোলো → **Sources** ট্যাব
2. **Zangetsu Sources** (JS সোর্স) সেকশনে যাও
3. **Add repository** চাপো, এই লিংকটা দাও:

```
https://raw.githubusercontent.com/Mamun015/zangetsu-dhakaflix/main/index.json
```

4. লিস্টে আসবে তিনটা সোর্স — **DhakaFlix Movies**, **DhakaFlix Series**,
   **DhakaFlix Anime**। যেটা দরকার ইনস্টল করো।

## কী কী আছে

| সোর্স | ক্যাটাগরি |
|---|---|
| **DhakaFlix Movies** | English Movies, English 1080p, Hindi, South Indian (+Hindi Dubbed), Kolkata Bangla, Foreign Language, IMDb Top 250, 3D |
| **DhakaFlix Series** | TV & Web Series, Korean TV & Web Series, Cartoon TV Series |
| **DhakaFlix Anime** | Anime TV Series, Animation Movies, Animation Movies 1080p |

## কীভাবে কাজ করে

- সার্ভারে h5ai 0.29 চলছে। এর JSON API (`POST` + `{action:"get", …}`) দিয়ে
  ফোল্ডার লিস্টিং আর **রিকার্সিভ regex সার্চ** নেওয়া হয় — তাই সার্চ ১–৩ সেকেন্ডে
  আসে, কোনো নিজস্ব ইনডেক্স লাগে না।
- সার্ভার-রেন্ডার করা HTML টেবিলও ফলব্যাক হিসেবে পার্স করা হয়, JSON API বন্ধ
  হয়ে গেলে সোর্সটা তবু চলবে।
- ভিডিও ফাইল nginx থেকে সোজা আসে (`Accept-Ranges: bytes`), তাই সিক করা,
  রিজিউম, ডাউনলোড — সবই কাজ করে, কোনো প্রক্সি লাগে না।
- একটাই ফাইল, তিনটা sourceId: `dhakaflix_movies`, `dhakaflix_series`,
  `dhakaflix_anime`। `getInfo()`-র `type` আর ক্যাটাগরি লিস্ট sourceId থেকে ঠিক হয়।

## সীমাবদ্ধতা

- ফাইল নেম থেকে টাইটেল, বছর, সিজন, এপিসোড পার্স করা হয় — মেটাডেটা (পোস্টার,
  গল্প, কাস্ট) সার্ভারে নেই, তাই দেখানো হয় না।
- ডাউনলোড স্পিড, প্লেব্যাক — সবই তোমার BDIX লাইন আর সার্ভারের উপর নির্ভর।
- সার্ভার নিজের পোর্টালে লিংক বদলালে `sources/dhakaflix.js`-এর `CATEGORIES`
  অ্যারে আপডেট করতে হবে।

## ডেভেলপমেন্ট

```bash
# যেকোনো একটা সোর্স Zangetsu-র নিজস্ব JS হারনেসে লোড করে টেস্ট করা যায়
node js_harness/host.mjs      # Zangetsu রিপোর হেল্পার
```

প্রোভাইডার কনট্র্যাক্ট: `getInfo`, `getHome`, `popular`, `search`,
`getDetail`, `getEpisodes`, `getVideoSources` — প্রতিটা ফাংশনের জন্য
[Zangetsu-র `providers/_template.js`](https://github.com/Spyou/Zangetsu/blob/main/providers/_template.js)
দেখো।

## লাইসেন্স

GNU General Public License v3.0 (GPL-3.0)। Zangetsu অ্যাপও GPL-3.0, তাই এই সোর্স
একই লাইসেন্সে রাখা হয়েছে — কেউ ব্যবহার বা বদল করলে কোডও খোলা রাখতে হবে।
বিস্তারিত `LICENSE` ফাইলে।
