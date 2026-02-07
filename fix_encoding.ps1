$pre = Get-Content -Path "c:/projects/oneduo-main/pre_fixes.sql" -Encoding UTF8
$main = Get-Content -Path "c:/projects/oneduo-main/full_database_schema.txt" -Encoding UTF8
$post = Get-Content -Path "c:/projects/oneduo-main/post_fixes.sql" -Encoding UTF8

$all = @()
$all += $pre
$all += $main
$all += $post

[System.IO.File]::WriteAllLines("c:/projects/oneduo-main/deployment_schema.sql", $all)
