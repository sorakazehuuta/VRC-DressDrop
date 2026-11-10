-- テンプレート一覧の「名前順」用の読み（ひらがな）。漢字の名前もあいうえお順に並べるため。
-- 管理画面で変えられる。空のときは名前で並べる
alter table public.templates add column name_reading text not null default '';

update public.templates as t set name_reading = v.reading
from (values
  ('tshirt', 'てぃーしゃつ'),
  ('cake', 'けーき'),
  ('badge', 'かんばっじ'),
  ('mug', 'まぐかっぷ'),
  ('tapestry', 'たぺすとりー'),
  ('deskmat', 'ですくまっと'),
  ('fan', 'うちわ'),
  ('body-pillow', 'だきまくらかばー'),
  ('skateboard', 'すけーとぼーど'),
  ('book', 'ほん'),
  ('can', 'かん'),
  ('coaster', 'こーすたー'),
  ('roll-banner', 'ろーるばなー'),
  ('angle-fold', 'ちぇんじんぐぱねる'),
  ('drop-tin', 'どろっぷかん'),
  ('shaker', 'かくてるしぇいかー'),
  ('double-jigger', 'だぶるじがー'),
  ('bar-mat', 'ばーまっと'),
  ('service-tray', 'さーびすとれい'),
  ('blade', 'つきだしかんばん'),
  ('brass-gallery', 'ぎゃらりーぱねる'),
  ('counter-card', 'かうんたーかーど'),
  ('diptych', 'ふたつおりぱねる'),
  ('direction', 'みちしるべかんばん'),
  ('hanging', 'つりさげかんばん'),
  ('instant', 'ふぉとすたんど'),
  ('menu-pedestal', 'めにゅーすたんど'),
  ('oak-easel', 'いーぜるぼーど'),
  ('pavement', 'すたんどかんばん'),
  ('photo-frame', 'ふぉとぼーど'),
  ('suspended', 'ふれーむぱねる')
) as v(slug, reading)
where t.slug = v.slug;
