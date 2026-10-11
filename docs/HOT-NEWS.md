# মূল পাতার সংবাদ পরিচালনা

১. `/staff/login` থেকে প্রশাসক হিসেবে প্রবেশ করুন। মেনুর **সংবাদ ও তথ্য** খুলুন (`/admin/content`)।

২. **সংবাদ ও গুরুত্বপূর্ণ তথ্য → নতুন যোগ** নির্বাচন করুন। স্থায়ী শনাক্তকারী দিন, যেমন `community-update`। বাংলা ও ইংরেজি শিরোনাম এবং লেখা আলাদা ঘরে লিখুন। প্রকাশিত সংবাদে দুই ভাষার তথ্য প্রয়োজন। ব্যক্তিগত পরিচয়, ফোন, ইমেইল বা আসল অভিযোগের প্রমাণ প্রকাশ করবেন না। লেখা সাধারণ টেক্সট হিসেবে দেখায়।

ঐচ্ছিক নিরাপদ লিংকের ঘরে তথ্যসূত্র দিতে পারেন। পূর্ণ সংবাদে **তথ্যসূত্র দেখুন** থেকে সেই লিংক খোলে।

৩. **গুরুত্বপূর্ণ সংবাদ হিসেবে মূল পাতায় দেখান** নির্বাচন করুন। **দৃশ্যমান** চালু রাখুন। **ক্রম** কম হলে সংবাদ আগে দেখাবে। **প্রকাশিত** নির্বাচন করে সংরক্ষণ করুন। প্রকাশের সময় ফাঁকা রাখলে এখনই দেখাবে; ভবিষ্যৎ সময় দিলে সেই সময়ের আগে সাধারণ মানুষ দেখতে পারবেন না।

৪. মূল পাতায় নির্বাচিত গুরুত্বপূর্ণ সংবাদ প্রতি পাতায় সর্বোচ্চ দশটি দেখাবে। **সব সংবাদ** (`/news`) পাতায় অন্যান্য প্রকাশিত সংবাদও থাকবে। শিরোনাম বা **বিস্তারিত পড়ুন** থেকে পুরো সংবাদ খোলে। খসড়া, বন্ধ, ভবিষ্যৎ প্রকাশ এবং মুছে রাখা সংবাদ public-এ দেখা যাবে না।

৫. সম্পাদনা করতে সংবাদটি নির্বাচন করে সংরক্ষণ করুন। মূল পাতার নির্বাচন তুলে নিলে সেটি মূল পাতা থেকে সরবে, কিন্তু প্রকাশিত থাকলে সংবাদ সংগ্রহে থাকবে। মুছে রাখা সংবাদ ৩০ দিন ফেরত আনা যায়; ফেরত আনলে খসড়া হয়, আবার প্রকাশ করতে হবে। পুরোনো সংস্করণ ফেরত আনলেও নতুন করে প্রকাশ প্রয়োজন।

পুরোনো homepage-এর পরিচিতি, প্রক্রিয়া ও নীতিমালা এখন **প্ল্যাটফর্ম পরিচিতি** (`/about`) পাতায় আছে। আগের মূল পাতার অতিরিক্ত তথ্য ও অংশের নিয়ন্ত্রণ এই পাতায় কাজ করে। নতুন মূল পাতায় **অভিযোগ জানান** একবার আছে।

ইন্টারফেসের বাংলা/ইংরেজি নির্বাচন মেনু, বোতাম, অবস্থা, বিজ্ঞপ্তি, তারিখ এবং ত্রুটি বার্তায় প্রযোজ্য। লেখা, ব্যক্তির নাম, গোপন সংকেত, ফাইলের নাম ও অন্যান্য ব্যবহারকারীর দেওয়া তথ্য স্বয়ংক্রিয়ভাবে অনুবাদ করা হয় না। সংবাদ ও অতিরিক্ত public তথ্যের ভাষা সংস্করণ প্রশাসক আলাদা করে লেখেন। পুরোনো তথ্যের বাংলা সংস্করণ না থাকলে বাংলা অনুবাদ অনুপস্থিত থাকার বার্তা দেখাবে; ইংরেজি লেখা দিয়ে বাংলা সংস্করণ পূরণ করা হবে না।

# Editorial workflow (English)

Sign in as an administrator, then open **News and content → News and hot information**. Create a stable slug and both language versions. Select **Feature as hot news on the homepage**, leave visibility enabled, choose **Published**, and save. Lower order values appear first. Future publication dates remain private until due. Unfeaturing removes the story from the homepage while retaining it in the public archive if still published. Trash and version restores return content to draft.

The homepage contains one reporting link and up to eight selected hot news cards. The archive has ten-item pagination and title/category/district/date filters. Editors can upload scanned cover photos/video and preview both languages. The previous landing content lives at `/about`. There is no sample news in the owner's database. Browser visual acceptance remains unverified; automated tests cover language rendering, publication visibility, pagination, roles/CSRF and content withdrawal. See [all twenty improvements](FEATURE-IMPROVEMENTS.md).
