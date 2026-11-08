# Что взято из чужого опыта для дерева навыков и анимаций

## Дерево
- Линейная цепочка быстрая и предсказуемая, но не приносит удовлетворения. Суть хорошего дерева в развилках со смыслом ([What makes a skill tree interesting](https://mygamedesign-frontend.pages.dev/what-makes-a-skill-tree-interesting-to-explore)).
- Ветка должна расходиться в разные манеры игры, а не вести к одному-двум узлам ([разбор дерева Diablo IV игроками](https://us.forums.blizzard.com/en/d3/t/diablo-iv-skill-tree-feedback/22272)).
- Главная претензия к дереву Diablo IV: выбрал навык, дальше линейная цепочка улучшений ([The core problem is the skilltree](https://us.forums.blizzard.com/en/d4/t/the-core-problem-is-the-skilltree/153714)). Этого избегаем.
- Минусы на узлах создают цену выбора ([обсуждение Last Epoch](https://forum.lastepoch.com/t/why-are-skills-designed-this-way/47508)).
- Иллюзия выбора хуже отсутствия выбора: варианты должны менять то, что игрок делает, а не цифру ([Illusion of choice](https://www.wayline.io/blog/illusion-of-choice-rpgs-systemic-depth)).
Источники в основном мнения разработчиков и игроков, а не исследования: это ориентиры, а не законы.

## Анимация навыка
- Навык состоит из трёх частей: предвосхищение, удар, продолжение движения. Перенос удара раньше делает навык отзывчивее без смены общей длины ([разработчик Last Epoch](https://forum.lastepoch.com/t/making-skills-feel-more-responsive/17085)).
- Соблазн добавить побольше искр и огня не делает удар сильнее. Нужен один читаемый образ ([Fogworld, анимации навыков](https://fabian-fuchs.itch.io/fogworld/devlog/908490/devlog-9-skill-animations)).
- Движение и форма сообщают, что произойдёт, а цвет и форма должны быть читаемы ([VFX: форма, цвет, движение](https://80.lv/articles/vfx-staples-shape-color-and-motion/), [правила VFX League of Legends](https://www.vfxapprentice.com/blog/10-league-of-legends-vfx-design-tips)).
- Каждая вещь отвечает на свой вопрос: вспышка сообщает, что попало, частицы и звук где, тряска насколько сильно, стоп-кадр насколько это важно. Тряска на каждый удар перестаёт работать ([Unity: game feel](https://uhiyama-lab.com/en/notes/unity/unity-game-feel-hit-feedback/), [2D combat juice](https://freegamesprites.com/es/news/game-feel-2d-combat-juice-tricks)).
- Стоп-кадр лёгкого удара короткий, тяжёлого в 2-3 раза длиннее ([Unity: game feel](https://uhiyama-lab.com/en/notes/unity/unity-game-feel-hit-feedback/)).

## Вывод для игры
Новых нарисованных кадров на каждый навык у нас нет: у героя 12 поз. Своё лицо навыку дают сочетание поз и их таймингов, способ движения к цели, главная фигура эффекта, реакция тела цели и вес удара. Правило: у двух навыков класса это сочетание не совпадает, а у каждого есть один главный образ.
