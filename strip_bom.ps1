$content = [System.IO.File]::ReadAllText("c:/projects/oneduo-main/deployment_schema.sql")
$bom = [char]0xFEFF
$content = $content.Replace($bom.ToString(), "")
[System.IO.File]::WriteAllText("c:/projects/oneduo-main/deployment_schema.sql", $content)
