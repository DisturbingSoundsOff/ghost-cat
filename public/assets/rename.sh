#!/usr/bin/env bash
# Run from your assets folder (the one containing Levels, Sounds, Sprites).
#   ./rename-assets.sh -n    dry run, only prints what it would do
#   ./rename-assets.sh       do it
# Renames sprites/sounds to the names main.ts expects, patches the image paths
# inside the Level JSONs to match (originals backed up in Levels.bak/),
# copies slide images into Slides/, and deletes all .mp3 files.
set -u
DRY=0
[ "${1:-}" = "-n" ] && DRY=1

for d in Levels Sounds Sprites; do
  [ -d "$d" ] || { echo "Run me from the assets folder (no ./$d here)"; exit 1; }
done

run() { if [ "$DRY" = 1 ]; then echo "   [dry] $*"; else "$@"; fi; }

OLD=(); NEW=(); ESC=()

# Tiled may store non-ASCII names as \uXXXX escapes, so patch that form too
esc() {
  python3 -c 'import sys
print("".join(c if ord(c) < 128 else "\\u%04x" % ord(c) for c in sys.argv[1]))' "$1"
}

# ---------------------------------------------------------------- sprites
SPRITES=(
  "Призрак.png|ghost.png"
  "Призрак_Меч1.png|ghost-sword1.png"
  "Призрак_Меч2.png|ghost-sword2.png"
  "Кот.png|cat.png"
  "Кот_Меч1.png|cat-sword1.png"
  "Кот_Меч2.png|cat-sword2.png"
  "Кот_Меч2_big.png|cat-sword2-big.png"
  "Монстр_64.png|monster64.png"
  "Монета_Малая.png|small-coin.png"
  "Меч.png|sword.png"
  "Пол.png|floor.png"
  "Стена_64.png|wall64.png"
  "Стена_64_Заросший_.png|wall64-overgrown.png"
  "Стена_64_Трещины.png|wall64-cracked.png"
  "Стена_Игра_Роз.png|wall-game-pink.png"
  "Стена_Игра_Фиол.png|wall-game-purple.png"
  "Стена_Роз_Заросший.png|wall-pink-overgrown.png"
  "Стена_Роз_Трещины.png|wall-pink-cracked.png"
  "Стена_Фиол_Заросший_.png|wall-purple-overgrown.png"
  "Стена_Фиол_Трещины.png|wall-purple-cracked.png"
  "Спрайты_2.png|sprites2.png"
  "Новый проект.png|new-project.png"
)
echo "== Sprites"
for pair in "${SPRITES[@]}"; do
  old="${pair%%|*}"; new="${pair##*|}"
  if [ -e "Sprites/$old" ]; then
    echo " $old -> $new"
    run mv "Sprites/$old" "Sprites/$new"
  fi
  OLD+=("$old"); NEW+=("$new"); ESC+=("$(esc "$old")")
done

# ---------------------------------------------------------------- sounds
SOUNDS=(
  "взял меч2|took-sword"
  "удар мечом3|sword-hit"
  "проигрыш вам не стать котиком|you-lost-ending"
)
echo "== Sounds"
for pair in "${SOUNDS[@]}"; do
  old="${pair%%|*}"; new="${pair##*|}"
  for ext in ogg wav; do
    if [ -e "Sounds/$old.$ext" ]; then
      echo " $old.$ext -> $new.$ext"
      run mv "Sounds/$old.$ext" "Sounds/$new.$ext"
    fi
  done
done

# ---------------------------------------------------------------- slides
echo "== Slides"
SRC="Игра питон/Заставки фоны"
run mkdir -p Slides
copy_slide() {
  if [ -e "$SRC/$1" ]; then
    echo " $1 -> Slides/$2"
    run cp "$SRC/$1" "Slides/$2"
  else
    echo " (missing: $SRC/$1)"
  fi
}
for i in 1 2 3 4 5 6 7 8; do copy_slide "Фон_$i.2.png" "intro_$i.png"; done
for i in 1 2 3; do copy_slide "Уровень_$i.png" "level_$i.png"; done
copy_slide "Фон_Проигрыш.png" "death.png"
copy_slide "Фон_Победа1.png" "win_1.png"
copy_slide "Фон_Победа2.png" "win_2.png"

# ---------------------------------------------------------------- level JSONs
echo "== Patching image paths in Levels/*.json (backup in Levels.bak/)"
if [ "$DRY" = 0 ]; then
  mkdir -p Levels.bak
  for f in Levels/*.json; do [ -e "Levels.bak/$(basename "$f")" ] || cp "$f" Levels.bak/; done
  for f in Levels/*.json; do
    for i in "${!OLD[@]}"; do
      pat="${OLD[$i]//./\\.}"
      sed -i "s|$pat|${NEW[$i]}|g" "$f"
      e="${ESC[$i]//\\/\\\\}"; e="${e//./\\.}"
      [ "$e" != "$pat" ] && sed -i "s|$e|${NEW[$i]}|g" "$f"
    done
  done
else
  echo "   [dry] would patch ${#OLD[@]} names in each Levels/*.json"
fi

# ---------------------------------------------------------------- mp3
echo "== Deleting .mp3 files"
if [ "$DRY" = 1 ]; then find . -iname '*.mp3' -print | sed 's/^/   [dry] rm /'
else find . -iname '*.mp3' -print -delete; fi

# ---------------------------------------------------------------- check
echo "== Checking that every image referenced by the level JSONs exists"
bad=0
for f in Levels/*.json; do
  while read -r p; do
    [ -z "$p" ] && continue
    if [ ! -f "$(dirname "$f")/$p" ]; then echo "   MISSING in $f: $p"; bad=1; fi
  done < <(grep -o '"image": *"[^"]*"' "$f" | sed 's/^"image": *"//; s/"$//; s|\\/|/|g' | sort -u)
done
[ "$bad" = 0 ] && echo "   all good"
echo "Done."
