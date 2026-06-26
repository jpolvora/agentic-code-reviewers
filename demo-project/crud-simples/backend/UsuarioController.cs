using System;
using System.Data.SqlClient;
using Microsoft.AspNetCore.Mvc;

namespace DemoProject.CrudSimples.Backend
{
    [ApiController]
    [Route("api/[controller]")]
    public class UsuarioController : ControllerBase
    {
        private readonly string _connectionString = "Server=myServerAddress;Database=myDataBase;User Id=myUsername;Password=myPassword;";

        [HttpGet("{id}")]
        public IActionResult GetUsuario(string id)
        {
            try
            {
                // VULNERABILIDADE CRÍTICA: SQL Injection via concatenação direta de strings
                string query = "SELECT * FROM Usuarios WHERE Id = '" + id + "'";
                
                // VULNERABILIDADE: SqlConnection e SqlCommand não estão dentro de blocos 'using' ou chamando Dispose()
                var connection = new SqlConnection(_connectionString);
                var command = new SqlCommand(query, connection);
                
                connection.Open();
                var reader = command.ExecuteReader();
                
                if (reader.Read())
                {
                    var usuario = new
                    {
                        Id = reader["Id"].ToString(),
                        Nome = reader["Nome"].ToString(),
                        Email = reader["Email"].ToString()
                    };
                    return Ok(usuario);
                }

                return NotFound();
            }
            catch (Exception ex)
            {
                // VULNERABILIDADE: Vazamento de detalhes de infraestrutura expondo a Stack Trace completa
                return StatusCode(500, ex.ToString());
            }
        }

        [HttpPost]
        public IActionResult CriarUsuario([FromBody] UsuarioDto input)
        {
            // VULNERABILIDADE: Falta de validação mínima dos dados (ex: Nome nulo ou Email inválido)
            // Nenhum Validate ou verificação ModelState.IsValid
            
            var connection = new SqlConnection(_connectionString);
            string insertQuery = $"INSERT INTO Usuarios (Nome, Email) VALUES ('{input.Nome}', '{input.Email}')";
            var command = new SqlCommand(insertQuery, connection);
            
            connection.Open();
            command.ExecuteNonQuery();
            
            return CreatedAtAction(nameof(GetUsuario), new { id = input.Nome }, input);
        }
    }

    public class UsuarioDto
    {
        public string Nome { get; set; }
        public string Email { get; set; }
    }
}
